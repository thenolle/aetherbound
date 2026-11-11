import { beforeEach, describe, expect, test } from 'bun:test'
import { ProtocolError } from '../protocol/errors'
import { fixtureSetup } from '../rules/test-fixtures'
import { migrate, openDatabase } from './database'
import { SqliteMatchStore, describeMatch } from './match-store'
import { MIGRATIONS } from './migrations'

let db: ReturnType<typeof openDatabase>
let store: SqliteMatchStore
const header = describeMatch('m1', fixtureSetup(5), 1000)

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  store = new SqliteMatchStore(db)
})

const count = (): number => (db.query("SELECT COUNT(*) AS n FROM match_log WHERE match_id = 'm1'").get() as { n: number }).n

describe('SqliteMatchStore', () => {
  test('round trips the header, the input log and the outcome', () => {
    store.begin(header)
    store.append('m1', 0, [{ kind: 'command', actor: 0, commandId: 'a', command: { type: 'end_turn' } }, { kind: 'timeout' }], null)
    expect(store.load('m1')?.outcome).toBeNull()
    store.append('m1', 2, [{ kind: 'command', actor: 1, commandId: 'b', command: { type: 'play', handIndex: 1, position: 0, targetUid: 4 } }], { winner: 0, endedAt: 2000 })

    expect(store.load('m1')).toEqual({
      header,
      outcome: { winner: 0, endedAt: 2000 },
      entries: [
        { kind: 'command', actor: 0, commandId: 'a', command: { type: 'end_turn' } },
        { kind: 'timeout' },
        { kind: 'command', actor: 1, commandId: 'b', command: { type: 'play', handIndex: 1, position: 0, targetUid: 4 } }
      ]
    })
  })

  test('returns null for an unknown match', () => {
    expect(store.load('nope')).toBeNull()
  })

  test('rejects gaps, repeats and unknown matches without partial writes', () => {
    store.begin(header)
    store.append('m1', 0, [{ kind: 'timeout' }], null)
    expect(() => store.append('m1', 0, [{ kind: 'timeout' }, { kind: 'timeout' }], null)).toThrow('log gap')
    expect(() => store.append('m1', 3, [{ kind: 'timeout' }], null)).toThrow('log gap')
    expect(() => store.append('ghost', 0, [{ kind: 'timeout' }], null)).toThrow()
    expect(count()).toBe(1)
  })

  test('detects a tampered command frame on load', () => {
    store.begin(header)
    store.append('m1', 0, [{ kind: 'command', actor: 0, commandId: 'a', command: { type: 'end_turn' } }], null)
    db.run("UPDATE match_log SET frame = x'ff' WHERE match_id = 'm1' AND idx = 0")
    expect(() => store.load('m1')).toThrow(ProtocolError)
  })

  test('the match mode is stored and defaults to casual', () => {
    store.begin(describeMatch('r1', fixtureSetup(5), 1, [null, null], 'ranked'))
    store.begin(describeMatch('c1', fixtureSetup(5), 1))
    expect(store.load('r1')?.header.mode).toBe('ranked')
    expect(store.load('c1')?.header.mode).toBe('casual')
  })
})