import { describe, expect, test } from 'bun:test'
import { createRegistry } from '../shared/cards'
import { DomainError } from '../shared/errors'
import { applyCommand, createMatch } from './engine'
import { projectState } from './projection'
import { cid, fixtureSetup, makeCard } from './test-fixtures'
import type { Command, MatchState, PlayerIndex } from './types'

const oath = { family: 'oath', attack: undefined, health: undefined } as const

const registry = createRegistry([
  makeCard(1, { ...oath, cost: 1, goal: 2, effects: [{ kind: 'draw', count: 1 }] }),
  makeCard(2)
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

describe('oaths', () => {
  test('swearing spends Aether and starts at zero progress', () => {
    const state = fresh()
    state.players[0].hand = [cid(1)]
    const { state: next, events } = step(state, 0, { type: 'swear', handIndex: 0 })
    expect(next.players[0].oaths).toEqual([{ uid: 1, cardId: cid(1), progress: 0, goal: 2 }])
    expect(next.players[0].aether).toBe(9)
    expect(events).toEqual([{ type: 'oath_sworn', player: 0, uid: 1, cardId: cid(1), goal: 2 }])
  })

  test('only one oath can be sworn at a time', () => {
    const state = fresh()
    state.players[0].oaths = [{ uid: 7, cardId: cid(1), progress: 0, goal: 2 }]
    state.players[0].hand = [cid(1)]
    expect(codeOf(() => step(state, 0, { type: 'swear', handIndex: 0 }))).toBe('board_full')
  })

  test('playing bound cards advances the oath and fulfilling it pays the reward', () => {
    const state = fresh()
    state.players[0].oaths = [{ uid: 7, cardId: cid(1), progress: 0, goal: 2 }]
    state.players[0].hand = [cid(2), cid(2)]
    const first = step(state, 0, { type: 'play', handIndex: 0, position: 0 })
    expect(first.events).toContainEqual({ type: 'oath_progress', player: 0, uid: 7, progress: 1 })
    expect(first.state.players[0].oaths[0]?.progress).toBe(1)

    const deckBefore = first.state.players[0].deck.length
    const second = step(first.state, 0, { type: 'play', handIndex: 0, position: 1 })
    expect(second.events).toContainEqual({ type: 'oath_fulfilled', player: 0, uid: 7 })
    expect(second.state.players[0].oaths).toEqual([])
    expect(second.state.players[0].hand).toHaveLength(1)
    expect(second.state.players[0].deck).toHaveLength(deckBefore - 1)
  })

  test('oaths are public and malformed oaths are rejected', () => {
    const state = fresh()
    state.players[0].oaths = [{ uid: 7, cardId: cid(1), progress: 1, goal: 2 }]
    expect(projectState(state, 1).opponent.oaths).toEqual(state.players[0].oaths)

    expect(() => createRegistry([makeCard(1, { ...oath, effects: [{ kind: 'draw', count: 1 }] })])).toThrow(DomainError)
    expect(() => createRegistry([makeCard(1, { ...oath, goal: 2, effects: [{ kind: 'damage', amount: 1, target: 'chosen-enemy-minion' }] })])).toThrow(DomainError)
  })
})