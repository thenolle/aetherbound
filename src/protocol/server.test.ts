import { describe, expect, test } from 'bun:test'
import { createMatch } from '../rules/engine'
import { projectState } from '../rules/projection'
import type { ViewEvent } from '../rules/projection'
import { cid, fixtureSetup } from '../rules/test-fixtures'
import type { PlayerIndex } from '../rules/types'
import { Rng } from '../shared/rng'
import { ProtocolError } from './errors'
import type { ProtocolErrorCode } from './errors'
import { EVENT_IDS, decodeServerFrame, encodeServerFrame } from './server'
import type { ServerMessage } from './server'

const ALL_EVENTS: readonly ViewEvent[] = [
  { type: 'turn_started', player: 0, turn: 3, aether: 2 },
  { type: 'turn_timed_out', player: 1 },
  { type: 'card_drawn', player: 0, cardId: cid(1) },
  { type: 'card_drawn', player: 1, cardId: null },
  { type: 'card_burned', player: 0, cardId: cid(2) },
  { type: 'fatigue', player: 1, damage: 3 },
  { type: 'minion_played', player: 0, uid: 4, cardId: cid(3), position: 2 },
  { type: 'writ_cast', player: 1, cardId: cid(4) },
  { type: 'iron_equipped', player: 0, cardId: cid(5), attack: 2, durability: 2 },
  { type: 'iron_broken', player: 0 },
  { type: 'ability_used', player: 1 },
  { type: 'attacked', player: 0, attackerUid: 4, target: { kind: 'minion', uid: 9 } },
  { type: 'attacked', player: 0, attackerUid: 4, target: { kind: 'hero' } },
  { type: 'hero_attacked', player: 1, target: { kind: 'hero' } },
  { type: 'damaged', player: 0, uid: null, amount: 5 },
  { type: 'damaged', player: 1, uid: 7, amount: 2 },
  { type: 'healed', player: 0, uid: null, amount: 1 },
  { type: 'taxed', player: 1, amount: 1 },
  { type: 'minion_died', player: 0, uid: 4 },
  { type: 'surrendered', player: 1 },
  { type: 'game_over', winner: 0 }
]

const eventsMessage: ServerMessage = {
  type: 'events',
  events: ALL_EVENTS.map((event, index) => ({ seq: index + 1, event }))
}

function richState() {
  const state = createMatch(fixtureSetup(3)).state
  state.players[0].weapon = { cardId: cid(1), attack: 2, durability: 1 }
  state.players[0].tariff = 1
  state.players[0].board = [
    {
      uid: 1,
      cardId: cid(2),
      attack: 2,
      health: 1,
      maxHealth: 2,
      exhausted: true,
      keywords: ['shield-wall', 'haste'],
      onDeath: [
        { kind: 'damage', amount: 1, target: 'enemy-hero' },
        { kind: 'draw', count: 1 },
        { kind: 'tariff', amount: 2 },
        { kind: 'heal', amount: 3, target: 'all-enemy-minions' }
      ]
    }
  ]
  state.players[1].board = [
    { uid: 2, cardId: cid(3), attack: 3, health: 3, maxHealth: 3, exhausted: false, keywords: [], onDeath: [] }
  ]
  state.players[1].heroHealth = -3
  state.winner = 0
  return state
}

const frameOf = (id: number, ...payload: number[]): Uint8Array =>
  new Uint8Array([0xae, 0x01, 0x00, id, 0x00, payload.length, ...payload])

const outcome = (data: Uint8Array): 'ok' | ProtocolErrorCode => {
  try {
    decodeServerFrame(data)
    return 'ok'
  } catch (error) {
    if (error instanceof ProtocolError) return error.code
    throw error
  }
}

describe('server frames', () => {
  test('every event type is covered by the samples', () => {
    expect(new Set(ALL_EVENTS.map((event) => event.type)).size).toBe(Object.keys(EVENT_IDS).length)
  })

  test('events round trip', () => {
    expect(decodeServerFrame(encodeServerFrame(9, eventsMessage))).toEqual({ sequence: 9, message: eventsMessage })
  })

  test('snapshots round trip for both viewers', () => {
    const state = richState()
    for (const viewer of [0, 1] as const satisfies readonly PlayerIndex[]) {
      const message: ServerMessage = { type: 'snapshot', seq: 321, view: projectState(state, viewer) }
      expect(decodeServerFrame(encodeServerFrame(1, message))).toEqual({ sequence: 1, message })
    }
  })

  test('accepted matches a golden vector and rejected round trips', () => {
    const accepted: ServerMessage = { type: 'accepted', commandSequence: 7, duplicate: false, lastSeq: 300 }
    expect(Array.from(encodeServerFrame(3, accepted))).toEqual([0xae, 0x01, 0x00, 0x12, 0x03, 0x04, 0x07, 0x00, 0xac, 0x02])
    const rejected: ServerMessage = { type: 'rejected', commandSequence: 4, code: 'not_your_turn', message: 'it is not your turn' }
    expect(decodeServerFrame(encodeServerFrame(0, rejected))).toEqual({ sequence: 0, message: rejected })
  })

  test('rejects malformed server frames', () => {
    expect(outcome(frameOf(99))).toBe('unsupported')
    expect(outcome(frameOf(17, 0xc8, 0x01))).toBe('too_large')
    expect(outcome(frameOf(17, 1, 1, 99))).toBe('unsupported')
    expect(outcome(frameOf(17, 1, 1, 1, 7, 1, 1))).toBe('malformed')
    expect(outcome(frameOf(18, 7, 2, 1))).toBe('malformed')
    expect(outcome(frameOf(18, 7, 0, 1, 0))).toBe('malformed')
    expect(outcome(frameOf(19, 1, 200, 0))).toBe('malformed')
    expect(outcome(frameOf(17, 1, 1, 4, 0, 3, 0x42, 0x41, 0x44))).toBe('malformed')
    const valid = encodeServerFrame(0, { type: 'accepted', commandSequence: 1, duplicate: false, lastSeq: 1 })
    expect(outcome(valid.slice(0, valid.length - 1))).toBe('truncated')
  })

  test('mutated frames only ever produce protocol errors', () => {
    const rng = new Rng(404)
    const state = richState()
    const frames = [
      encodeServerFrame(0, eventsMessage),
      encodeServerFrame(1, { type: 'snapshot', seq: 5, view: projectState(state, 0) }),
      encodeServerFrame(2, { type: 'accepted', commandSequence: 1, duplicate: true, lastSeq: 9 }),
      encodeServerFrame(3, { type: 'rejected', commandSequence: 2, code: 'rate_limited', message: 'slow down' })
    ]
    for (const frame of frames) {
      for (let round = 0; round < 300; round += 1) {
        const mutated = frame.slice(0, rng.nextInt(frame.length + 1))
        if (mutated.length > 0 && rng.nextInt(4) > 0) mutated[rng.nextInt(mutated.length)] = rng.nextInt(256)
        outcome(mutated)
      }
    }
  })
})