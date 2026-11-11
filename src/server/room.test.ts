import { describe, expect, test } from 'bun:test'
import { encodeCommandFrame } from '../protocol/commands'
import { decodeServerFrame } from '../protocol/server'
import type { ServerMessage } from '../protocol/server'
import { fixtureSetup } from '../rules/test-fixtures'
import type { Command, PlayerIndex } from '../rules/types'
import { Room } from './room'
import type { RoomOptions, SeatLink } from './room'

const endTurn: Command = { type: 'end_turn' }

function makeLink() {
  const frames: ServerMessage[] = []
  let closed: [number, string] | null = null
  const link: SeatLink = {
    send: (data) => {
      frames.push(decodeServerFrame(data).message)
    },
    close: (code, reason) => {
      closed = [code, reason]
    }
  }
  return { link, frames, closedWith: () => closed }
}

function makeRoom(overrides: Partial<RoomOptions> = {}) {
  const timers: { run: () => void, ms: number, cancelled: boolean }[] = []
  const clock = { now: 0 }
  const options: RoomOptions = {
    turnMs: 1000,
    burst: 20,
    refillPerSecond: 10,
    now: () => clock.now,
    schedule: (run, ms) => {
      const entry = { run, ms, cancelled: false }
      timers.push(entry)
      return () => {
        entry.cancelled = true
      }
    },
    ...overrides
  }
  const active = () => timers.filter((timer) => !timer.cancelled)
  const fire = () => {
    const timer = active().at(-1)
    if (timer === undefined) throw new Error('no active timer')
    timer.cancelled = true
    timer.run()
  }
  return { room: new Room(fixtureSetup(1), options), clock, active, fire, timers }
}

const send = (room: Room, seat: PlayerIndex, link: SeatLink, sequence: number, id: string, command: Command): void =>
  room.handleFrame(seat, link, encodeCommandFrame(sequence, id, command))

const types = (frames: readonly ServerMessage[]): string[] => frames.map((frame) => frame.type)

describe('Room', () => {
  test('attaching sends a snapshot to that seat only', () => {
    const { room } = makeRoom()
    const a = makeLink()
    const b = makeLink()
    room.attach(0, a.link)
    expect(types(a.frames)).toEqual(['snapshot'])
    expect(b.frames).toHaveLength(0)
    const first = a.frames[0]
    if (first?.type === 'snapshot') expect(first.view.viewer).toBe(0)
  })

  test('an accepted command reaches both seats as redacted events plus a snapshot', () => {
    const { room } = makeRoom()
    const a = makeLink()
    const b = makeLink()
    room.attach(0, a.link)
    room.attach(1, b.link)
    a.frames.length = 0
    b.frames.length = 0

    send(room, 0, a.link, 0, 'c1', endTurn)
    expect(types(a.frames)).toEqual(['accepted', 'events', 'snapshot'])
    expect(types(b.frames)).toEqual(['events', 'snapshot'])

    const seenByA = a.frames[1]
    const seenByB = b.frames[1]
    if (seenByA?.type !== 'events' || seenByB?.type !== 'events') throw new Error('expected events')
    const drawA = seenByA.events.find((item) => item.event.type === 'card_drawn')
    const drawB = seenByB.events.find((item) => item.event.type === 'card_drawn')
    expect(drawA?.event).toMatchObject({ type: 'card_drawn', player: 1, cardId: null })
    expect(drawB?.event).toMatchObject({ type: 'card_drawn', player: 1 })
    if (drawB?.event.type === 'card_drawn') expect(drawB.event.cardId).not.toBeNull()
  })

  test('a rejected command is answered to the sender only', () => {
    const { room } = makeRoom()
    const a = makeLink()
    const b = makeLink()
    room.attach(0, a.link)
    room.attach(1, b.link)
    a.frames.length = 0
    b.frames.length = 0
    send(room, 1, b.link, 0, 'x1', endTurn)
    expect(b.frames).toEqual([{ type: 'rejected', commandSequence: 0, code: 'not_your_turn', message: 'it is not your turn' }])
    expect(a.frames).toHaveLength(0)
  })

  test('a repeated command id is acknowledged without a second broadcast', () => {
    const { room } = makeRoom()
    const a = makeLink()
    room.attach(0, a.link)
    send(room, 0, a.link, 0, 'c1', endTurn)
    send(room, 0, a.link, 1, 'c1', endTurn)
    expect(a.frames.filter((frame) => frame.type === 'events')).toHaveLength(1)
    expect(a.frames.filter((frame) => frame.type === 'accepted')[1]).toMatchObject({ duplicate: true })
  })

  test('a stale or repeated frame sequence is rejected', () => {
    const { room } = makeRoom()
    const a = makeLink()
    room.attach(0, a.link)
    send(room, 0, a.link, 5, 'c1', endTurn)
    send(room, 0, a.link, 5, 'c2', endTurn)
    expect(a.frames.at(-1)).toMatchObject({ type: 'rejected', code: 'invalid_command', commandSequence: 5 })
  })

  test('a malformed frame closes the connection', () => {
    const { room } = makeRoom()
    const a = makeLink()
    room.attach(0, a.link)
    room.handleFrame(0, a.link, new Uint8Array([1, 2, 3]))
    expect(a.closedWith()?.[0]).toBe(4400)
  })

  test('commands are rate limited per connection and recover over time', () => {
    const { room, clock } = makeRoom({ burst: 2, refillPerSecond: 1 })
    const a = makeLink()
    room.attach(0, a.link)
    send(room, 0, a.link, 0, 'a', endTurn)
    send(room, 0, a.link, 1, 'b', endTurn)
    send(room, 0, a.link, 2, 'c', endTurn)
    expect(a.frames.at(-1)).toMatchObject({ type: 'rejected', code: 'rate_limited' })
    clock.now = 2000
    send(room, 0, a.link, 3, 'd', endTurn)
    expect(a.frames.at(-1)).toMatchObject({ type: 'rejected', code: 'not_your_turn' })
  })

  test('a newer connection replaces the old one without resetting the turn timer', () => {
    const { room, active } = makeRoom()
    const a = makeLink()
    const c = makeLink()
    room.attach(0, a.link)
    room.attach(0, c.link)
    expect(a.closedWith()?.[0]).toBe(4000)
    expect(types(c.frames)).toEqual(['snapshot'])
    const before = a.frames.length
    send(room, 0, a.link, 0, 'old', endTurn)
    expect(a.frames).toHaveLength(before)
    expect(active()).toHaveLength(1)
  })

  test('the turn timer ends the turn and stops after the match ends', () => {
    const { room, active, fire } = makeRoom()
    const a = makeLink()
    room.attach(0, a.link)
    expect(active()).toHaveLength(1)
    expect(active()[0]?.ms).toBe(1000)

    fire()
    const events = a.frames.find((frame) => frame.type === 'events')
    if (events?.type !== 'events') throw new Error('expected events')
    expect(events.events.some((item) => item.event.type === 'turn_timed_out')).toBe(true)
    const snapshot = a.frames.at(-1)
    if (snapshot?.type === 'snapshot') expect(snapshot.view.active).toBe(1)
    expect(active()).toHaveLength(1)

    send(room, 0, a.link, 0, 'bye', { type: 'surrender' })
    expect(room.winner).toBe(1)
    expect(active()).toHaveLength(0)
  })
})