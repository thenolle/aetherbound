import { describe, expect, test } from 'bun:test'
import { createRegistry } from '../shared/cards'
import { DomainError } from '../shared/errors'
import { applyCommand, createMatch } from './engine'
import { cid, fixtureSetup, makeCard } from './test-fixtures'
import type { Command, MatchState, Minion, PlayerIndex } from './types'

const writ = { family: 'writ', attack: undefined, health: undefined, cost: 1 } as const

const registry = createRegistry([
  makeCard(9, { token: true, cost: 0, attack: 2, health: 1 }),
  makeCard(1, { ...writ, effects: [{ kind: 'drain', amount: 2 }] }),
  makeCard(2, { ...writ, effects: [{ kind: 'raise', cardId: cid(9), attack: 2, health: 1, count: 3 }] })
])

const fresh = (): MatchState => {
  const state = createMatch(fixtureSetup(1)).state
  state.players[0].aether = 10
  return state
}

const step = (state: MatchState, actor: PlayerIndex, command: Command) => applyCommand(state, actor, command, registry)

const mk = (uid: number, attack: number, health: number, extra: Partial<Minion> = {}): Minion => ({
  uid,
  cardId: cid(1),
  attack,
  health,
  maxHealth: health,
  exhausted: false,
  keywords: [],
  onDeath: [],
  ...extra
})

describe('drain', () => {
  test('hurts the enemy hero and heals yours by the same amount, up to your maximum', () => {
    const state = fresh()
    state.players[0].hand = [cid(1), cid(1)]
    state.players[0].heroHealth = 29
    const first = step(state, 0, { type: 'cast', handIndex: 0 }).state
    expect(first.players[1].heroHealth).toBe(28)
    expect(first.players[0].heroHealth).toBe(30)
    const second = step(first, 0, { type: 'cast', handIndex: 0 }).state
    expect(second.players[0].heroHealth).toBe(30)
  })

  test('a lethal drain ends the match without healing', () => {
    const state = fresh()
    state.players[0].hand = [cid(1)]
    state.players[0].heroHealth = 20
    state.players[1].heroHealth = 2
    const { state: next, events } = step(state, 0, { type: 'cast', handIndex: 0 })
    expect(next.winner).toBe(0)
    expect(next.players[0].heroHealth).toBe(20)
    expect(events.some((event) => event.type === 'healed')).toBe(false)
  })
})

describe('graveyard', () => {
  test('every minion that dies is counted for its owner', () => {
    const state = fresh()
    state.players[0].board = [mk(1, 3, 1)]
    state.players[1].board = [mk(5, 1, 1)]
    const next = step(state, 0, { type: 'attack', attackerUid: 1, target: { kind: 'minion', uid: 5 } }).state
    expect(next.players[0].fallen).toBe(1)
    expect(next.players[1].fallen).toBe(1)
  })

  test('raise spends the fallen count and respects free wards', () => {
    const state = fresh()
    state.players[0].hand = [cid(2), cid(2)]
    state.players[0].fallen = 2
    const first = step(state, 0, { type: 'cast', handIndex: 0 })
    expect(first.state.players[0].board.map((minion) => minion.cardId)).toEqual([cid(9), cid(9)])
    expect(first.state.players[0].fallen).toBe(0)
    const crowded = fresh()
    crowded.players[0].hand = [cid(2)]
    crowded.players[0].fallen = 5
    crowded.players[0].board = [1, 2, 3, 4, 5, 6].map((uid) => mk(uid + 20, 1, 1))
    const next = step(crowded, 0, { type: 'cast', handIndex: 0 }).state
    expect(next.players[0].board).toHaveLength(7)
    expect(next.players[0].fallen).toBe(4)
  })
})

describe('echo', () => {
  test('a dying minion with echo triggers its death effects twice', () => {
    const state = fresh()
    state.players[0].board = [mk(1, 3, 5)]
    state.players[1].board = [mk(5, 1, 1, { keywords: ['echo'], onDeath: [{ kind: 'damage', amount: 1, target: 'enemy-hero' }] })]
    const next = step(state, 0, { type: 'attack', attackerUid: 1, target: { kind: 'minion', uid: 5 } }).state
    expect(next.players[0].heroHealth).toBe(28)
  })
})

describe('validation', () => {
  test('a raise must name a matching token card', () => {
    const bad = makeCard(1, { ...writ, effects: [{ kind: 'raise', cardId: cid(9), attack: 7, health: 1, count: 1 }] })
    expect(() => createRegistry([makeCard(9, { token: true, cost: 0, attack: 2, health: 1 }), bad])).toThrow(DomainError)
  })
})