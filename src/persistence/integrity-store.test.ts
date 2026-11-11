import { beforeEach, describe, expect, test } from 'bun:test'
import { fixtureSetup } from '../rules/test-fixtures'
import { SqliteAccountStore } from './account-store'
import { migrate, openDatabase } from './database'
import { IntegrityStore } from './integrity-store'
import { SqliteMatchStore, describeMatch } from './match-store'
import type { MatchMode } from './match-store'
import { MIGRATIONS } from './migrations'

let matches: SqliteMatchStore
let integrity: IntegrityStore
let alice: string
let bob: string

beforeEach(() => {
  const db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  const accounts = new SqliteAccountStore(db, () => 1000)
  matches = new SqliteMatchStore(db)
  integrity = new IntegrityStore(db, () => 9000)
  alice = accounts.upsertGoogleAccount('alice', 'Alice').id
  bob = accounts.upsertGoogleAccount('bob', 'Bob').id
})

function record(id: string, winner: 0 | 1, inputs: number, endedAt: number, mode: MatchMode = 'ranked'): void {
  matches.begin(describeMatch(id, fixtureSetup(1), 1, [alice, bob], mode))
  matches.append(id, 0, Array.from({ length: inputs }, () => ({ kind: 'timeout' as const })), { winner, endedAt })
}

describe('IntegrityStore', () => {
  test('a very short ranked match is flagged, a normal one and a casual one are not', () => {
    record('short', 0, 3, 1000)
    record('normal', 0, 20, 2000)
    record('casual', 0, 3, 3000, 'casual')
    expect(integrity.inspect('short')).toEqual(['short_match'])
    expect(integrity.inspect('normal')).toEqual([])
    expect(integrity.inspect('casual')).toEqual([])
    expect(integrity.inspect('missing')).toEqual([])
  })

  test('the same pair meeting too often in a day is flagged from the limit on', () => {
    for (let index = 1; index <= 5; index += 1) record(`m${index}`, 0, 20, 1000 * index)
    for (let index = 1; index <= 4; index += 1) expect(integrity.inspect(`m${index}`)).toEqual([])
    expect(integrity.inspect('m5')).toEqual(['repeat_pair'])
  })

  test('strictly alternating winners across the streak are flagged as win trading', () => {
    for (let index = 1; index <= 6; index += 1) record(`m${index}`, index % 2 === 0 ? 1 : 0, 20, 1000 * index)
    const kinds = Array.from({ length: 6 }, (_, index) => integrity.inspect(`m${index + 1}`))
    expect(kinds[4]).toEqual(['repeat_pair'])
    expect(kinds[5]).toContain('win_trading')
    expect(kinds.slice(0, 5).flat()).not.toContain('win_trading')
  })

  test('a flag is raised once, listed for review, and can be reviewed once', () => {
    record('short', 0, 3, 1000)
    integrity.inspect('short')
    expect(integrity.inspect('short')).toEqual([])
    const open = integrity.openFlags(10)
    expect(open).toHaveLength(1)
    expect(open[0]).toMatchObject({ matchId: 'short', kind: 'short_match' })
    expect(integrity.review(open[0]?.id ?? '')).toBe(true)
    expect(integrity.review(open[0]?.id ?? '')).toBe(false)
    expect(integrity.openFlags(10)).toEqual([])
  })
})