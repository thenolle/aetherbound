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
  { type: 'surged', player: 0, amount: 2 },
  { type: 'healed', player: 0, uid: null, amount: 1 },
  { type: 'taxed', player: 1, amount: 1 },
  { type: 'minion_died', player: 0, uid: 4 },
  { type: 'surrendered', player: 1 },
  { type: 'game_over', winner: 0 },
  { type: 'holding_placed', player: 0, uid: 6, cardId: cid(6), charges: 3 },
  { type: 'holding_activated', player: 1, uid: 6 },
  { type: 'holding_destroyed', player: 1, uid: 6 },
  { type: 'snare_set', player: 0, uid: 10, cardId: cid(8) },
  { type: 'snare_set', player: 1, uid: 11, cardId: null },
  { type: 'snare_sprung', player: 1, uid: 11, cardId: cid(9) },
  { type: 'oath_sworn', player: 0, uid: 12, cardId: cid(10), goal: 3 },
  { type: 'oath_progress', player: 0, uid: 12, progress: 1 },
  { type: 'oath_fulfilled', player: 0, uid: 12 },
  { type: 'frozen', player: 1, uid: 5 },
  { type: 'minion_summoned', player: 0, uid: 12, cardId: cid(9) },
  { type: 'blighted', player: 1, uid: 5, stacks: 3 },
  { type: 'warded', player: 0, uid: 4 },
  { type: 'ward_broken', player: 1, uid: 5 },
  { type: 'grew', player: 0, uid: 12, attack: 4, health: 6 },
  { type: 'buffed', player: 0, uid: 4, attack: 3, health: 3 },
  { type: 'forged', player: 1, attack: 4, durability: 2 },
  { type: 'card_stolen', player: 0, cardId: cid(11) },
  { type: 'card_stolen', player: 1, cardId: null },
]

const eventsMessage: ServerMessage = {
  type: 'events',
  events: ALL_EVENTS.map((event, index) => ({ seq: index + 1, event }))
}

function richState() {
  const state = createMatch(fixtureSetup(3)).state
  state.players[0].weapon = { cardId: cid(1), attack: 2, durability: 1 }
  state.players[0].tariff = 1
  state.players[0].fallen = 3
  state.players[0].healed = 5
  state.players[1].fallen = 1
  state.players[0].board = [{
    uid: 1,
    cardId: cid(2),
    attack: 2,
    health: 1,
    maxHealth: 2,
    exhausted: true,
    warded: true,
    keywords: ['shield-wall', 'haste', 'echo'],
    blight: 2,
    grows: { attack: 1, health: 2 },
    onDeath: [
      { kind: 'damage', amount: 1, target: 'enemy-hero' },
      { kind: 'draw', count: 1 },
      { kind: 'tariff', amount: 2 },
      { kind: 'heal', amount: 3, target: 'all-enemy-minions' },
      { kind: 'freeze', target: 'all-enemy-minions' },
      { kind: 'summon', cardId: cid(9), attack: 1, health: 1, count: 2 },
      { kind: 'blight', amount: 2, target: 'chosen-enemy-minion' },
      { kind: 'drain', amount: 2 },
      { kind: 'raise', cardId: cid(9), attack: 2, health: 1, count: 2 },
      { kind: 'surge', amount: 3 },
      { kind: 'rupture', count: 2 },
      { kind: 'forge', attack: 1, durability: 1 },
      { kind: 'buff', attack: 1, health: 2 },
      { kind: 'heal', amount: 2, target: 'all-own-minions' },
      { kind: 'steal', count: 2, take: true },
      { kind: 'counterfeit' },
      { kind: 'ward' },
      { kind: 'if_healed', threshold: 6, then: [{ kind: 'damage', amount: 2, target: 'enemy-hero' }, { kind: 'draw', count: 1 }] },
    ]
  }]
  state.players[1].board = [{ uid: 2, cardId: cid(3), attack: 3, health: 3, maxHealth: 3, exhausted: false, keywords: [], onDeath: [] }]
  state.players[1].heroHealth = -3
  state.winner = 0
  state.players[0].holdings = [{ uid: 6, cardId: cid(6), charges: 2, used: true }]
  state.players[1].holdings = [{ uid: 9, cardId: cid(7), charges: 1, used: false }]
  state.players[0].snares = [{ uid: 10, cardId: cid(8) }]
  state.players[1].snares = [{ uid: 11, cardId: cid(9) }]
  state.players[0].oaths = [{ uid: 12, cardId: cid(10), progress: 1, goal: 3 }]
  const chilled = state.players[1].board[0]
  if (chilled !== undefined) chilled.frozen = true
  return state
}

const frameOf = (id: number, ...payload: number[]): Uint8Array => new Uint8Array([0xae, 0x01, 0x00, id, 0x00, payload.length, ...payload])
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