import { beforeEach, describe, expect, test } from 'bun:test'
import { fixtureSetup } from '../rules/test-fixtures'
import { SqliteAccountStore } from './account-store'
import { migrate, openDatabase } from './database'
import { SqliteMatchStore, describeMatch } from './match-store'
import { MIGRATIONS } from './migrations'
import { SqliteRatingStore } from './rating-store'

let store: SqliteRatingStore
let matches: SqliteMatchStore
let alice: string
let bob: string

beforeEach(() => {
  const db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  const accounts = new SqliteAccountStore(db, () => 1000)
  store = new SqliteRatingStore(db, () => 1000)
  matches = new SqliteMatchStore(db)
  alice = accounts.upsertGoogleAccount('alice', 'Alice').id
  bob = accounts.upsertGoogleAccount('bob', 'Bob').id
})

const match = (id: string): void => matches.begin(describeMatch(id, fixtureSetup(1), 1, [alice, bob]))

describe('SqliteRatingStore', () => {
  test('unknown accounts start at the initial rating with no games', () => {
    expect(store.get(alice)).toEqual({ mmr: 1000, games: 0 })
  })

  test('a result updates both players and counts the games', () => {
    match('m1')
    const update = store.applyResult('m1', alice, bob)
    expect(update?.winnerAfter).toBeCloseTo(1024, 6)
    expect(update?.loserAfter).toBeCloseTo(976, 6)
    expect(store.get(alice)).toMatchObject({ games: 1 })
    expect(store.get(alice).mmr).toBeCloseTo(1024, 6)
    expect(store.get(bob).mmr).toBeCloseTo(976, 6)
  })

  test('a match is rated once, whatever happens', () => {
    match('m1')
    expect(store.applyResult('m1', alice, bob)).not.toBeNull()
    expect(store.applyResult('m1', alice, bob)).toBeNull()
    expect(store.applyResult('m1', bob, alice)).toBeNull()
    expect(store.get(alice).games).toBe(1)
  })

  test('unknown matches and self-play are refused', () => {
    expect(() => store.applyResult('ghost', alice, bob)).toThrow()
    match('m1')
    expect(() => store.applyResult('m1', alice, alice)).toThrow('themselves')
    expect(store.get(alice).games).toBe(0)
  })

  test('the visible rank appears only after the placement games', () => {
    for (let index = 0; index < 5; index += 1) {
      match(`m${index}`)
      store.applyResult(`m${index}`, alice, bob)
      if (index === 3) expect(store.rankFor(alice)).toEqual({ gamesPlayed: 4, placementGamesLeft: 1, rank: null })
    }
    const report = store.rankFor(alice)
    expect(report.gamesPlayed).toBe(5)
    expect(report.placementGamesLeft).toBe(0)
    expect(report.rank).not.toBeNull()
    expect(JSON.stringify(report)).not.toContain('mmr')
  })
})