import { beforeEach, describe, expect, test } from 'bun:test'
import { migrate, openDatabase } from './database'
import { SqliteAccountStore } from './account-store'
import { MIGRATIONS } from './migrations'

let now = 1000
let db: ReturnType<typeof openDatabase>
let store: SqliteAccountStore

beforeEach(() => {
  now = 1000
  db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  store = new SqliteAccountStore(db, () => now)
})

describe('SqliteAccountStore', () => {
  test('a google subject maps to one stable account whose name follows google', () => {
    const first = store.upsertGoogleAccount('sub-1', 'Mireille')
    now = 2000
    const again = store.upsertGoogleAccount('sub-1', 'Mireille Vane')
    expect(again.id).toBe(first.id)
    expect(again).toEqual({ id: first.id, displayName: 'Mireille Vane', role: 'player' })
    expect(store.upsertGoogleAccount('sub-2', 'Other').id).not.toBe(first.id)
    expect((db.query('SELECT COUNT(*) AS n FROM accounts').get() as { n: number }).n).toBe(2)
  })

  test('sessions resolve until they expire and are stored only as hashes', () => {
    const account = store.upsertGoogleAccount('sub-1', 'Mireille')
    const session = store.createSession(account.id, 'agent', 5000)
    expect(store.resolveSession(session.token)).toEqual(account)
    expect(JSON.stringify(db.query('SELECT * FROM sessions').all())).not.toContain(session.token)
    now = 6000
    expect(store.resolveSession(session.token)).toBeNull()
  })

  test('unknown or malformed tokens never resolve', () => {
    expect(store.resolveSession('nope')).toBeNull()
    expect(store.resolveSession('')).toBeNull()
  })

  test('sessions can be revoked one at a time or all at once', () => {
    const account = store.upsertGoogleAccount('sub-1', 'Mireille')
    const a = store.createSession(account.id, null, 5000)
    const b = store.createSession(account.id, null, 5000)
    store.revokeSession(a.token)
    expect(store.resolveSession(a.token)).toBeNull()
    expect(store.resolveSession(b.token)).not.toBeNull()
    store.createSession(account.id, null, 5000)
    expect(store.revokeAllSessions(account.id)).toBe(2)
    expect(store.resolveSession(b.token)).toBeNull()
  })

  test('sign-in flows can be taken once and only before they expire', () => {
    const flow = { state: 's', nonce: 'n', codeVerifier: 'v' }
    store.saveFlow('flow-1', flow, 1000)
    expect(store.takeFlow('flow-1')).toEqual(flow)
    expect(store.takeFlow('flow-1')).toBeNull()

    store.saveFlow('flow-2', flow, 1000)
    now = 3000
    expect(store.takeFlow('flow-2')).toBeNull()
    expect(store.takeFlow('never-saved')).toBeNull()
  })

  test('sweeping removes only expired sessions and flows', () => {
    const account = store.upsertGoogleAccount('sub-1', 'Mireille')
    store.createSession(account.id, null, 1000)
    const keep = store.createSession(account.id, null, 100000)
    store.saveFlow('old', { state: 's', nonce: 'n', codeVerifier: 'v' }, 500)
    store.saveFlow('fresh', { state: 's', nonce: 'n', codeVerifier: 'v' }, 100000)
    now = 5000
    expect(store.sweepExpired()).toBe(2)
    expect(store.resolveSession(keep.token)).not.toBeNull()
    expect(store.takeFlow('fresh')).not.toBeNull()
  })

  test('deleting an account removes its sessions', () => {
    const account = store.upsertGoogleAccount('sub-1', 'Mireille')
    const session = store.createSession(account.id, null, 5000)
    db.run('DELETE FROM accounts WHERE id = ?1', [account.id])
    expect(store.resolveSession(session.token)).toBeNull()
  })
})