import { describe, expect, test } from 'bun:test'
import { createRegistry } from '../shared/cards'
import type { Effect } from '../shared/effects'
import { DomainError } from '../shared/errors'
import { applyCommand, createMatch } from './engine'
import { cid, fixtureSetup, makeCard } from './test-fixtures'
import type { Command, MatchState, Minion, PlayerIndex } from './types'

const registry = createRegistry([
  makeCard(1, { cost: 1, onPlay: [{ kind: 'damage', amount: 2, target: 'chosen-enemy-minion' }] }),
  makeCard(2, { cost: 1, onPlay: [{ kind: 'damage', amount: 1, target: 'enemy-hero' }] })
])

const fresh = (): MatchState => {
  const state = createMatch(fixtureSetup(1)).state
  state.players[0].aether = 10
  return state
}

const step = (state: MatchState, actor: PlayerIndex, command: Command) => applyCommand(state, actor, command, registry)

const codeOf = (fn: () => unknown): string | null => {
  try {
    fn()
    return null
  } catch (error) {
    return error instanceof DomainError ? error.code : 'non-domain-error'
  }
}

const mk = (uid: number, attack: number, health: number, onDeath: Effect[] = []): Minion => ({
  uid,
  cardId: cid(1),
  attack,
  health,
  maxHealth: health,
  exhausted: false,
  keywords: [],
  onDeath
})

describe('onPlay', () => {
  test('a targeted trigger needs and damages its target', () => {
    const state = fresh()
    state.players[0].hand = [cid(1)]
    state.players[1].board = [mk(5, 1, 2)]
    expect(codeOf(() => step(state, 0, { type: 'play', handIndex: 0, position: 0 }))).toBe('illegal_target')
    const next = step(state, 0, { type: 'play', handIndex: 0, position: 0, targetUid: 5 }).state
    expect(next.players[1].board).toHaveLength(0)
    expect(next.players[0].board).toHaveLength(1)
  })

  test('an untargeted trigger resolves on play', () => {
    const state = fresh()
    state.players[0].hand = [cid(2)]
    const next = step(state, 0, { type: 'play', handIndex: 0, position: 0 }).state
    expect(next.players[1].heroHealth).toBe(29)
  })

  test('a target given to a card that takes none is rejected', () => {
    const state = fresh()
    state.players[0].hand = [cid(2)]
    state.players[1].board = [mk(5, 1, 2)]
    expect(codeOf(() => step(state, 0, { type: 'play', handIndex: 0, position: 0, targetUid: 5 }))).toBe('invalid_command')
  })
})

describe('onDeath', () => {
  test('fires for the dead minion owner after combat', () => {
    const state = fresh()
    state.players[0].board = [mk(1, 3, 3)]
    state.players[1].board = [mk(5, 1, 2, [{ kind: 'damage', amount: 2, target: 'enemy-hero' }])]
    const next = step(state, 0, { type: 'attack', attackerUid: 1, target: { kind: 'minion', uid: 5 } }).state
    expect(next.players[1].board).toHaveLength(0)
    expect(next.players[0].heroHealth).toBe(28)
  })

  test('chained deaths settle in rounds', () => {
    const state = fresh()
    state.players[0].board = [
      mk(1, 3, 5),
      mk(2, 1, 1, [{ kind: 'damage', amount: 2, target: 'enemy-hero' }])
    ]
    state.players[1].board = [mk(5, 1, 2, [{ kind: 'damage', amount: 1, target: 'all-enemy-minions' }])]
    const { state: next, events } = step(state, 0, { type: 'attack', attackerUid: 1, target: { kind: 'minion', uid: 5 } })
    expect(next.players[0].board.map((minion) => minion.uid)).toEqual([1])
    expect(next.players[0].board[0]?.health).toBe(3)
    expect(next.players[1].heroHealth).toBe(28)
    expect(events.filter((event) => event.type === 'minion_died').map((event) => (event.type === 'minion_died' ? event.uid : -1))).toEqual([5, 2])
  })

  test('registry rejects malformed triggers', () => {
    expect(() => createRegistry([makeCard(1, { onDeath: [{ kind: 'damage', amount: 1, target: 'chosen-enemy-minion' }] })])).toThrow(DomainError)
    expect(() => createRegistry([makeCard(1, { onPlay: [] })])).toThrow(DomainError)
    expect(() => createRegistry([
      makeCard(1, { family: 'writ', attack: undefined, health: undefined, effects: [{ kind: 'draw', count: 1 }], onPlay: [{ kind: 'draw', count: 1 }] })
    ])).toThrow(DomainError)
  })
})