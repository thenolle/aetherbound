import { afterEach, describe, expect, test } from 'bun:test'
import { SqliteAccountStore } from '../persistence/account-store'
import { migrate, openDatabase } from '../persistence/database'
import { SqliteMatchStore } from '../persistence/match-store'
import { MIGRATIONS } from '../persistence/migrations'
import { fixtureSetup } from '../rules/test-fixtures'
import { Matchmaker } from './matchmaker'
import { RoomRegistry } from './rooms'

let rooms: RoomRegistry
let now = 0
let ratings: Record<string, number> = {}

function make(): Matchmaker {
  rooms = new RoomRegistry()
  now = 0
  return new Matchmaker(rooms, () => fixtureSetup(1), () => now, { coin: () => true, ratingOf: (id) => ratings[id] ?? 1000 })
}

afterEach(() => {
  rooms.closeAll()
  ratings = {}
})

describe('ranked matchmaking', () => {
  test('pairs the closest ratings first', () => {
    ratings = { a: 1000, b: 1500, c: 1040 }
    const matchmaker = make()
    matchmaker.join('a', 'ranked')
    matchmaker.join('b', 'ranked')
    expect(matchmaker.status('b')).toEqual({ status: 'waiting' })
    matchmaker.join('c', 'ranked')
    expect(matchmaker.status('a').status).toBe('matched')
    expect(matchmaker.status('c').status).toBe('matched')
    expect(matchmaker.status('b')).toEqual({ status: 'waiting' })
  })

  test('the acceptable gap widens the longer players wait', () => {
    ratings = { a: 1000, b: 1400 }
    const matchmaker = make()
    matchmaker.join('a', 'ranked')
    matchmaker.join('b', 'ranked')
    now = 50_000
    matchmaker.tick()
    expect(matchmaker.status('a')).toEqual({ status: 'waiting' })
    now = 60_000
    matchmaker.tick()
    expect(matchmaker.status('a').status).toBe('matched')
    expect(matchmaker.status('b').status).toBe('matched')
  })

  test('ranked and casual queues never mix', () => {
    const matchmaker = make()
    matchmaker.join('a', 'ranked')
    matchmaker.join('b', 'casual')
    expect(matchmaker.status('a')).toEqual({ status: 'waiting' })
    expect(matchmaker.status('b')).toEqual({ status: 'waiting' })
  })

  test('an account is in one queue at a time', () => {
    const matchmaker = make()
    matchmaker.join('a', 'casual')
    matchmaker.join('a', 'ranked')
    matchmaker.join('b', 'casual')
    expect(matchmaker.status('a')).toEqual({ status: 'waiting' })
    expect(matchmaker.status('b')).toEqual({ status: 'waiting' })
    matchmaker.join('c', 'ranked')
    expect(matchmaker.status('a').status).toBe('matched')
    expect(matchmaker.status('c').status).toBe('matched')
  })

  test('the opened match is recorded as ranked with both accounts', () => {
    const db = openDatabase(':memory:')
    migrate(db, MIGRATIONS)
    const accounts = new SqliteAccountStore(db, () => 1000)
    const a = accounts.upsertGoogleAccount('a', 'A').id
    const b = accounts.upsertGoogleAccount('b', 'B').id
    rooms = new RoomRegistry(new SqliteMatchStore(db))
    const matchmaker = new Matchmaker(rooms, () => fixtureSetup(1), () => now, { coin: () => true })
    matchmaker.join(a, 'ranked')
    matchmaker.join(b, 'ranked')
    expect(db.query('SELECT mode, account_0, account_1 FROM matches').get()).toEqual({ mode: 'ranked', account_0: a, account_1: b })
  })
})