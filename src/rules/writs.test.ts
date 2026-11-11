import { describe, expect, test } from 'bun:test'
import { createRegistry } from '../shared/cards'
import { DomainError } from '../shared/errors'
import { applyCommand, createMatch } from './engine'
import { cid, fixtureSetup, makeCard, stats } from './test-fixtures'
import type { Command, MatchState, Minion, PlayerIndex } from './types'

const writ = { family: 'writ', attack: undefined, health: undefined } as const

const registry = createRegistry([
  makeCard(1, { ...writ, cost: 2, effects: [{ kind: 'damage', amount: 3, target: 'chosen-enemy-minion' }] }),
  makeCard(2, { ...writ, cost: 3, effects: [{ kind: 'damage', amount: 2, target: 'all-enemy-minions' }] }),
  makeCard(3, { ...writ, cost: 1, effects: [{ kind: 'damage', amount: 4, target: 'enemy-hero' }, { kind: 'draw', count: 1 }] }),
  makeCard(4, { ...writ, cost: 1, effects: [{ kind: 'heal', amount: 5, target: 'own-hero' }] }),
  makeCard(5)
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

const mk = (uid: number, n: number): Minion => {
  const { attack, health } = stats(n)
  return { uid, cardId: cid(n), attack, health, maxHealth: health, exhausted: false, keywords: [], onDeath: [] }
}

describe('writs', () => {
  test('a targeted writ kills its target and is spent', () => {
    const state = fresh()
    state.players[0].hand = [cid(1)]
    state.players[1].board = [mk(5, 3), mk(6, 2)]
    const { state: next, events } = step(state, 0, { type: 'cast', handIndex: 0, targetUid: 5 })
    expect(next.players[1].board.map((minion) => minion.uid)).toEqual([6])
    expect(next.players[0].hand).toHaveLength(0)
    expect(next.players[0].aether).toBe(8)
    expect(events[0]).toEqual({ type: 'writ_cast', player: 0, cardId: cid(1) })
    expect(events.some((event) => event.type === 'minion_died')).toBe(true)
  })

  test('a targeted writ needs a valid enemy minion', () => {
    const state = fresh()
    state.players[0].hand = [cid(1)]
    state.players[1].board = [mk(5, 3)]
    expect(codeOf(() => step(state, 0, { type: 'cast', handIndex: 0 }))).toBe('illegal_target')
    expect(codeOf(() => step(state, 0, { type: 'cast', handIndex: 0, targetUid: 99 }))).toBe('illegal_target')
  })

  test('an area writ hits every enemy minion', () => {
    const state = fresh()
    state.players[0].hand = [cid(2)]
    state.players[1].board = [mk(5, 2), mk(6, 3)]
    const next = step(state, 0, { type: 'cast', handIndex: 0 }).state
    expect(next.players[1].board).toHaveLength(1)
    expect(next.players[1].board[0]?.health).toBe(1)
  })

  test('effects resolve in order: damage then draw', () => {
    const state = fresh()
    state.players[0].hand = [cid(3)]
    const deckBefore = state.players[0].deck.length
    const next = step(state, 0, { type: 'cast', handIndex: 0 }).state
    expect(next.players[1].heroHealth).toBe(26)
    expect(next.players[0].hand).toHaveLength(1)
    expect(next.players[0].deck).toHaveLength(deckBefore - 1)
  })

  test('healing is capped at maximum health', () => {
    const state = fresh()
    state.players[0].hand = [cid(4)]
    state.players[0].heroHealth = 28
    const next = step(state, 0, { type: 'cast', handIndex: 0 }).state
    expect(next.players[0].heroHealth).toBe(30)
  })

  test('misuse is rejected', () => {
    const state = fresh()
    state.players[0].hand = [cid(5)]
    expect(codeOf(() => step(state, 0, { type: 'cast', handIndex: 0 }))).toBe('invalid_command')
    state.players[0].hand = [cid(1)]
    expect(codeOf(() => step(state, 0, { type: 'play', handIndex: 0, position: 0 }))).toBe('invalid_command')
    state.players[0].hand = [cid(3)]
    expect(codeOf(() => step(state, 0, { type: 'cast', handIndex: 0, targetUid: 5 }))).toBe('invalid_command')
  })

  test('lethal damage stops later effects', () => {
    const state = fresh()
    state.players[0].hand = [cid(3)]
    state.players[1].heroHealth = 3
    const { state: next, events } = step(state, 0, { type: 'cast', handIndex: 0 })
    expect(next.winner).toBe(0)
    expect(events.some((event) => event.type === 'card_drawn')).toBe(false)
  })

  test('registry rejects malformed writs', () => {
    expect(() => createRegistry([makeCard(1, { ...writ })])).toThrow(DomainError)
    expect(() => createRegistry([makeCard(1, { ...writ, effects: [{ kind: 'damage', amount: 0, target: 'enemy-hero' }] })])).toThrow(DomainError)
    expect(() => createRegistry([makeCard(1, { ...writ, keywords: ['haste'], effects: [{ kind: 'draw', count: 1 }] })])).toThrow(DomainError)
  })
})