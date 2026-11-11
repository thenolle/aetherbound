import { describe, expect, test } from 'bun:test'
import { createRegistry } from '../shared/cards'
import { DomainError } from '../shared/errors'
import { applyCommand, createMatch } from './engine'
import { projectState } from './projection'
import { cid, fixtureSetup, makeCard, stats } from './test-fixtures'
import type { Command, MatchState, Minion, PlayerIndex } from './types'

const holding = { family: 'holding', attack: undefined, health: undefined } as const

const registry = createRegistry([
  makeCard(1, { ...holding, cost: 2, durability: 2, effects: [{ kind: 'damage', amount: 1, target: 'enemy-hero' }] }),
  makeCard(2, { ...holding, cost: 1, durability: 1, effects: [{ kind: 'damage', amount: 3, target: 'chosen-enemy-minion' }] }),
  makeCard(3)
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

const endTurn: Command = { type: 'end_turn' }

describe('holdings', () => {
  test('placing spends Aether and registers the charges', () => {
    const state = fresh()
    state.players[0].hand = [cid(1)]
    const { state: next, events } = step(state, 0, { type: 'place', handIndex: 0 })
    expect(next.players[0].holdings).toEqual([{ uid: 1, cardId: cid(1), charges: 2, used: false }])
    expect(next.players[0].aether).toBe(8)
    expect(next.players[0].hand).toHaveLength(0)
    expect(events).toEqual([{ type: 'holding_placed', player: 0, uid: 1, cardId: cid(1), charges: 2 }])
  })

  test('the number of holding slots is limited', () => {
    const state = fresh()
    state.players[0].holdings = [
      { uid: 7, cardId: cid(1), charges: 2, used: false },
      { uid: 8, cardId: cid(1), charges: 2, used: false }
    ]
    state.players[0].hand = [cid(1)]
    expect(codeOf(() => step(state, 0, { type: 'place', handIndex: 0 }))).toBe('board_full')
  })

  test('a holding activates once per turn, refreshes next turn and is destroyed at zero charges', () => {
    const state = fresh()
    state.players[0].holdings = [{ uid: 7, cardId: cid(1), charges: 2, used: false }]
    const activate: Command = { type: 'activate', holdingUid: 7 }

    const first = step(state, 0, activate).state
    expect(first.players[1].heroHealth).toBe(29)
    expect(first.players[0].holdings[0]).toMatchObject({ charges: 1, used: true })
    expect(codeOf(() => step(first, 0, activate))).toBe('invalid_command')

    const later = step(step(first, 0, endTurn).state, 1, endTurn).state
    expect(later.players[0].holdings[0]?.used).toBe(false)
    const { state: last, events } = step(later, 0, activate)
    expect(last.players[1].heroHealth).toBe(28)
    expect(last.players[0].holdings).toEqual([])
    expect(events.some((event) => event.type === 'holding_destroyed')).toBe(true)
  })

  test('a targeted holding needs an enemy minion', () => {
    const state = fresh()
    state.players[0].holdings = [{ uid: 7, cardId: cid(2), charges: 1, used: false }]
    state.players[1].board = [mk(5, 3)]
    expect(codeOf(() => step(state, 0, { type: 'activate', holdingUid: 7 }))).toBe('illegal_target')
    const next = step(state, 0, { type: 'activate', holdingUid: 7, targetUid: 5 }).state
    expect(next.players[1].board).toHaveLength(0)
    expect(next.players[0].holdings).toHaveLength(0)
  })

  test('misuse is rejected', () => {
    const state = fresh()
    state.players[0].hand = [cid(3)]
    expect(codeOf(() => step(state, 0, { type: 'place', handIndex: 0 }))).toBe('invalid_command')
    expect(codeOf(() => step(state, 0, { type: 'activate', holdingUid: 99 }))).toBe('invalid_command')
    state.players[0].hand = [cid(1)]
    state.players[0].aether = 1
    expect(codeOf(() => step(state, 0, { type: 'place', handIndex: 0 }))).toBe('insufficient_aether')
  })

  test('the registry rejects malformed holdings', () => {
    expect(() => createRegistry([makeCard(1, { ...holding, effects: [{ kind: 'draw', count: 1 }] })])).toThrow(DomainError)
    expect(() => createRegistry([makeCard(1, { ...holding, durability: 1 })])).toThrow(DomainError)
    expect(() => createRegistry([makeCard(1, { ...holding, durability: 0, effects: [{ kind: 'draw', count: 1 }] })])).toThrow(DomainError)
  })

  test('holdings are public to the opponent', () => {
    const state = fresh()
    state.players[0].holdings = [{ uid: 7, cardId: cid(1), charges: 2, used: false }]
    expect(projectState(state, 1).opponent.holdings).toEqual(state.players[0].holdings)
  })
})