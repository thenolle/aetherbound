import { beforeEach, describe, expect, test } from 'bun:test'
import { SqliteAccountStore } from '../persistence/account-store'
import { migrate, openDatabase } from '../persistence/database'
import { MIGRATIONS } from '../persistence/migrations'
import { Auth } from './auth'

const ORIGIN = 'http://localhost:8080'

let accounts: SqliteAccountStore
let deleted: string[]
let auth: Auth

beforeEach(() => {
  deleted = []
  const db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  accounts = new SqliteAccountStore(db, () => Date.now())
  auth = new Auth({ google: null, accounts, publicOrigin: ORIGIN, onAccountDeleted: (id) => deleted.push(id) })
})

const request = (path: string, cookie: string | null, init: RequestInit = {}): Request =>
  new Request(`${ORIGIN}${path}`, { ...init, headers: { ...(cookie === null ? {} : { cookie }), ...(init.headers as Record<string, string> | undefined) } })

function signIn(sub: string): { id: string, cookie: string } {
  const account = accounts.upsertGoogleAccount(sub, `Player ${sub}`)
  return { id: account.id, cookie: `aetherbound_session=${accounts.createSession(account.id, `agent-${sub}`, 3_600_000).token}` }
}

type SessionList = { sessions: { id: string, current: boolean, userAgent: string | null }[] }

describe('session management', () => {
  test('lists the sessions of the account and marks the current one', async () => {
    const first = signIn('alice')
    const second = `aetherbound_session=${accounts.createSession(first.id, 'phone', 3_600_000).token}`
    const list = (await (await auth.handle(request('/auth/sessions', first.cookie))).json()) as SessionList
    expect(list.sessions).toHaveLength(2)
    expect(list.sessions.filter((entry) => entry.current)).toHaveLength(1)
    const other = (await (await auth.handle(request('/auth/sessions', second))).json()) as SessionList
    expect(other.sessions.find((entry) => entry.current)?.userAgent).toBe('phone')
    expect((await auth.handle(request('/auth/sessions', null))).status).toBe(401)
  })

  test('a session can be revoked by id, but only by its own account', async () => {
    const alice = signIn('alice')
    const bob = signIn('bob')
    const phone = `aetherbound_session=${accounts.createSession(alice.id, 'phone', 3_600_000).token}`
    const listed = (await (await auth.handle(request('/auth/sessions', alice.cookie))).json()) as SessionList
    const phoneId = listed.sessions.find((entry) => entry.userAgent === 'phone')?.id ?? ''

    expect((await auth.handle(request(`/auth/sessions/revoke?id=${phoneId}`, bob.cookie, { method: 'POST' }))).status).toBe(404)
    expect((await auth.handle(request(`/auth/sessions/revoke?id=${phoneId}`, alice.cookie, { method: 'POST', headers: { origin: 'http://evil.example' } }))).status).toBe(403)
    expect((await auth.handle(request('/auth/sessions/revoke?id=nothex', alice.cookie, { method: 'POST' }))).status).toBe(404)
    expect((await auth.handle(request('/auth/me', phone))).status).toBe(200)

    const revoked = await auth.handle(request(`/auth/sessions/revoke?id=${phoneId}`, alice.cookie, { method: 'POST' }))
    expect(revoked.status).toBe(204)
    expect(revoked.headers.getSetCookie()).toEqual([])
    expect((await auth.handle(request('/auth/me', phone))).status).toBe(401)
    expect((await auth.handle(request('/auth/me', alice.cookie))).status).toBe(200)
  })

  test('revoking the current session also clears the cookie', async () => {
    const alice = signIn('alice')
    const listed = (await (await auth.handle(request('/auth/sessions', alice.cookie))).json()) as SessionList
    const currentId = listed.sessions.find((entry) => entry.current)?.id ?? ''
    const response = await auth.handle(request(`/auth/sessions/revoke?id=${currentId}`, alice.cookie, { method: 'POST' }))
    expect(response.status).toBe(204)
    expect(response.headers.getSetCookie()[0]).toContain('Max-Age=0')
    expect((await auth.handle(request('/auth/me', alice.cookie))).status).toBe(401)
  })

  test('deleting an account needs an explicit confirmation and removes everything tied to it', async () => {
    const alice = signIn('alice')
    const bob = signIn('bob')
    const post = (body: string, cookie: string | null, headers: Record<string, string> = {}) => auth.handle(request('/auth/delete', cookie, { method: 'POST', body, headers }))

    expect((await post('{}', alice.cookie)).status).toBe(400)
    expect((await post('not json', alice.cookie)).status).toBe(400)
    expect((await post('{"confirm":"DELETE"}', null)).status).toBe(401)
    expect((await post('{"confirm":"DELETE"}', alice.cookie, { origin: 'http://evil.example' })).status).toBe(403)
    expect(deleted).toEqual([])

    const done = await post('{"confirm":"DELETE"}', alice.cookie)
    expect(done.status).toBe(204)
    expect(done.headers.getSetCookie()[0]).toContain('Max-Age=0')
    expect(deleted).toEqual([alice.id])
    expect((await auth.handle(request('/auth/me', alice.cookie))).status).toBe(401)
    expect((await auth.handle(request('/auth/me', bob.cookie))).status).toBe(200)
    expect(accounts.upsertGoogleAccount('alice', 'Player alice').id).not.toBe(alice.id)
  })
})