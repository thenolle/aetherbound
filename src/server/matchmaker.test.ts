import { afterEach, describe, expect, test } from 'bun:test'
import { encodeCommandFrame } from '../protocol/commands'
import { fixtureSetup } from '../rules/test-fixtures'
import { Matchmaker } from './matchmaker'
import { RoomRegistry } from './rooms'
import type { SeatLink } from './room'

let rooms: RoomRegistry

function make(coin = true) {
  rooms = new RoomRegistry()
  let now = 0
  const matchmaker = new Matchmaker(rooms, () => fixtureSetup(1), () => now, { coin: () => coin, maxWaitMs: 1000 })
  return { matchmaker, advance: (ms: number) => { now += ms } }
}

afterEach(() => rooms.closeAll())

describe('Matchmaker', () => {
  test('pairs two accounts into a room with bound seats and tokens', () => {
    const { matchmaker } = make()
    expect(matchmaker.join('a')).toEqual({ status: 'waiting' })
    const second = matchmaker.join('b')
    const first = matchmaker.status('a')
    if (first.status !== 'matched' || second.status !== 'matched') throw new Error('expected a match')
    expect([first.seat, second.seat]).toEqual([0, 1])
    expect(first.token).not.toBe(second.token)
    expect(rooms.lookup(first.token)?.accountId).toBe('a')
    expect(rooms.lookup(second.token)?.accountId).toBe('b')
  })

  test('the coin decides who takes the first seat', () => {
    const { matchmaker } = make(false)
    matchmaker.join('a')
    matchmaker.join('b')
    const a = matchmaker.status('a')
    expect(a.status === 'matched' && a.seat).toBe(1)
  })

  test('an account never pairs with itself and can leave the queue', () => {
    const { matchmaker } = make()
    matchmaker.join('a')
    expect(matchmaker.join('a')).toEqual({ status: 'waiting' })
    matchmaker.leave('a')
    expect(matchmaker.status('a')).toEqual({ status: 'idle' })
  })

  test('extra accounts keep waiting until another arrives', () => {
    const { matchmaker } = make()
    matchmaker.join('a')
    matchmaker.join('b')
    expect(matchmaker.join('c')).toEqual({ status: 'waiting' })
    expect(matchmaker.join('d').status).toBe('matched')
    expect(matchmaker.status('c').status).toBe('matched')
  })

  test('a live match is returned again until it ends', () => {
    const { matchmaker } = make()
    matchmaker.join('a')
    matchmaker.join('b')
    const assigned = matchmaker.status('a')
    if (assigned.status !== 'matched') throw new Error('expected a match')
    expect(matchmaker.join('a')).toEqual(assigned)

    const binding = rooms.lookup(assigned.token)
    if (binding === null) throw new Error('missing binding')
    const link: SeatLink = { send: () => undefined, close: () => undefined }
    binding.room.attach(binding.seat, link)
    binding.room.handleFrame(binding.seat, link, encodeCommandFrame(0, 'bye', { type: 'surrender' }))
    expect(matchmaker.status('a')).toEqual({ status: 'idle' })
  })

  test('waiting entries expire', () => {
    const { matchmaker, advance } = make()
    matchmaker.join('a')
    advance(1500)
    expect(matchmaker.sweep()).toBe(1)
    expect(matchmaker.status('a')).toEqual({ status: 'idle' })
  })
})