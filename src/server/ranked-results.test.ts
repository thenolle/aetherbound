import { beforeEach, describe, expect, test } from 'bun:test'
import { encodeCommandFrame } from '../protocol/commands'
import { SqliteAccountStore } from '../persistence/account-store'
import { migrate, openDatabase } from '../persistence/database'
import { SqliteMatchStore, describeMatch } from '../persistence/match-store'
import type { MatchMode } from '../persistence/match-store'
import { MIGRATIONS } from '../persistence/migrations'
import { SqliteRatingStore } from '../persistence/rating-store'
import { MatchSession } from '../rules/session'
import { fixtureSetup } from '../rules/test-fixtures'
import type { Command, PlayerIndex } from '../rules/types'
import { Matchmaker } from './matchmaker'
import { Room } from './room'
import type { RoomOptions, SeatLink } from './room'
import { RoomRegistry } from './rooms'

const options: RoomOptions = {
  turnMs: 1000,
  burst: 20,
  refillPerSecond: 10,
  now: () => 5000,
  schedule: () => () => undefined
}

const quiet = (): SeatLink => ({ send: () => undefined, close: () => undefined })
const send = (room: Room, seat: PlayerIndex, link: SeatLink, sequence: number, id: string, command: Command): void => room.handleFrame(seat, link, encodeCommandFrame(sequence, id, command))

let db: ReturnType<typeof openDatabase>
let matches: SqliteMatchStore
let ratings: SqliteRatingStore
let a: string
let b: string

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  const accounts = new SqliteAccountStore(db, () => 1000)
  matches = new SqliteMatchStore(db)
  ratings = new SqliteRatingStore(db, () => 1000)
  a = accounts.upsertGoogleAccount('a', 'A').id
  b = accounts.upsertGoogleAccount('b', 'B').id
})

function record(id: string, mode: MatchMode): void {
  const setup = fixtureSetup(3)
  matches.begin(describeMatch(id, setup, 1, [a, b], mode))
  const session = new MatchSession(setup)
  session.submit(0, 'bye', { type: 'surrender' })
  matches.append(id, 0, session.inputsFrom(0), { winner: 1, endedAt: 2 })
}

describe('ranked results', () => {
  test('the finish hook runs once, only after the outcome is stored', () => {
    const calls: { matchId: string, winner: PlayerIndex, inputs: number }[] = []
    const room = new Room(fixtureSetup(11), options, { matchId: 'm-1', recorder: matches, accounts: [a, b], mode: 'ranked', onFinished: (result) => calls.push(result) })
    const seatA = quiet()
    const seatB = quiet()
    room.attach(0, seatA)
    room.attach(1, seatB)
    send(room, 0, seatA, 0, 'turn', { type: 'end_turn' })
    expect(calls).toEqual([])
    send(room, 1, seatB, 0, 'bye', { type: 'surrender' })
    send(room, 1, seatB, 1, 'bye', { type: 'surrender' })
    expect(calls).toEqual([{ matchId: 'm-1', winner: 0, inputs: 2 }])
    expect(matches.load('m-1')?.outcome?.winner).toBe(0)
  })

  test('the hook never runs when the outcome could not be stored', () => {
    const calls: unknown[] = []
    const failing = {
      begin: () => undefined,
      append: () => {
        throw new Error('disk full')
      }
    }
    const room = new Room(fixtureSetup(11), options, { matchId: 'x', recorder: failing, mode: 'ranked', onFinished: (result) => calls.push(result) })
    const link = quiet()
    room.attach(0, link)
    const original = console.error
    console.error = () => undefined
    try {
      send(room, 0, link, 0, 'bye', { type: 'surrender' })
    } finally {
      console.error = original
    }
    expect(calls).toEqual([])
  })

  test('a finished ranked match updates both ratings through the registry', () => {
    const rooms = new RoomRegistry(matches, (matchId, winnerId, loserId) => {
      ratings.applyResult(matchId, winnerId, loserId)
    })
    const matchmaker = new Matchmaker(rooms, () => fixtureSetup(1), () => 0, { coin: () => true })
    matchmaker.join(a, 'ranked')
    matchmaker.join(b, 'ranked')
    const assigned = matchmaker.status(a)
    if (assigned.status !== 'matched') throw new Error('expected a match')
    const binding = rooms.lookup(assigned.token)
    if (binding === null) throw new Error('missing binding')
    const link = quiet()
    binding.room.attach(binding.seat, link)
    send(binding.room, binding.seat, link, 0, 'bye', { type: 'surrender' })

    expect(ratings.get(a).mmr).toBeLessThan(1000)
    expect(ratings.get(b).mmr).toBeGreaterThan(1000)
    expect(ratings.get(a).games).toBe(1)
    rooms.closeAll()
  })

  test('reconcile rates finished ranked matches that were missed, exactly once, and skips casual ones', () => {
    record('ranked-1', 'ranked')
    record('casual-1', 'casual')
    expect(ratings.reconcile()).toBe(1)
    expect(ratings.reconcile()).toBe(0)
    expect(ratings.get(b).mmr).toBeGreaterThan(1000)
    expect(ratings.get(a).mmr).toBeLessThan(1000)
    expect(ratings.get(a).games).toBe(1)
  })
})