import { describe, expect, test } from 'bun:test'
import { encodeCommandFrame } from '../protocol/commands'
import { decodeServerFrame } from '../protocol/server'
import type { ServerMessage } from '../protocol/server'
import { migrate, openDatabase } from '../persistence/database'
import { SqliteMatchStore, describeMatch } from '../persistence/match-store'
import { MIGRATIONS } from '../persistence/migrations'
import { restoreMatch } from '../persistence/restore'
import { MatchSession } from '../rules/session'
import { fixtureHero, fixtureRegistry, fixtureSetup } from '../rules/test-fixtures'
import type { Command, PlayerIndex } from '../rules/types'
import { DomainError } from '../shared/errors'
import { Room } from './room'
import type { RoomOptions, SeatLink } from './room'

const options: RoomOptions = {
  turnMs: 1000,
  burst: 20,
  refillPerSecond: 10,
  now: () => 5000,
  schedule: () => () => undefined
}

const content = { registry: fixtureRegistry, heroes: new Map([[fixtureHero.id, fixtureHero]]) }

const quietLink = (): SeatLink => ({ send: () => undefined, close: () => undefined })

const send = (room: Room, seat: PlayerIndex, link: SeatLink, sequence: number, id: string, command: Command): void =>
  room.handleFrame(seat, link, encodeCommandFrame(sequence, id, command))

const freshStore = (): SqliteMatchStore => {
  const db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  return new SqliteMatchStore(db)
}

describe('room persistence', () => {
  test('records accepted inputs and the match restores to the same state', () => {
    const store = freshStore()
    const room = new Room(fixtureSetup(11), options, { matchId: 'm-1', recorder: store })
    const a = quietLink()
    const b = quietLink()
    room.attach(0, a)
    room.attach(1, b)
    send(room, 0, a, 0, 'a', { type: 'end_turn' })
    send(room, 1, b, 0, 'b', { type: 'end_turn' })
    send(room, 1, b, 1, 'wrong-turn', { type: 'end_turn' })
    send(room, 0, a, 1, 'c', { type: 'surrender' })

    const stored = store.load('m-1')
    expect(stored?.entries).toHaveLength(3)
    expect(stored?.outcome).toEqual({ winner: 1, endedAt: 5000 })

    const reference = new MatchSession(fixtureSetup(11))
    reference.submit(0, 'a', { type: 'end_turn' })
    reference.submit(1, 'b', { type: 'end_turn' })
    reference.submit(0, 'c', { type: 'surrender' })

    const restored = restoreMatch(store, 'm-1', content)
    expect(restored.inspect()).toEqual(reference.inspect())
    expect(restored.winner).toBe(1)
  })

  test('a recorder failure rejects the command and shuts the room', () => {
    const frames: ServerMessage[] = []
    const closed: number[] = []
    const link: SeatLink = {
      send: (data) => {
        frames.push(decodeServerFrame(data).message)
      },
      close: (code) => {
        closed.push(code)
      }
    }
    const failing = {
      begin: () => undefined,
      append: () => {
        throw new Error('disk full')
      }
    }
    const room = new Room(fixtureSetup(3), options, { matchId: 'x', recorder: failing })
    room.attach(0, link)

    const original = console.error
    console.error = () => undefined
    try {
      send(room, 0, link, 0, 'a', { type: 'end_turn' })
      expect(frames.at(-1)).toMatchObject({ type: 'rejected', code: 'internal' })
      expect(closed).toContain(1011)
      const after = frames.length
      send(room, 0, link, 1, 'b', { type: 'end_turn' })
      expect(frames).toHaveLength(after)
    } finally {
      console.error = original
    }
  })

  test('restore refuses unknown matches, unsupported rules versions and unknown heroes', () => {
    const store = freshStore()
    expect(() => restoreMatch(store, 'nope', content)).toThrow(DomainError)

    store.begin({ ...describeMatch('old', fixtureSetup(1), 1), rulesVersion: 99 })
    expect(() => restoreMatch(store, 'old', content)).toThrow('unsupported rules version')

    store.begin(describeMatch('strange', fixtureSetup(1), 1))
    expect(() => restoreMatch(store, 'strange', { registry: fixtureRegistry, heroes: new Map() })).toThrow('unknown hero')
  })
})