import { describe, expect, test } from 'bun:test'
import { createRegistry } from '../shared/cards'
import { DomainError } from '../shared/errors'
import { applyCommand, createMatch } from './engine'
import { cid, fixtureSetup, makeCard, stats } from './test-fixtures'
import type { Command, MatchState, Minion, PlayerIndex } from './types'

const writ = { family: 'writ', attack: undefined, health: undefined, cost: 1 } as const

const registry = createRegistry([
  makeCard(1, { ...writ, effects: [{ kind: 'freeze', target: 'chosen-enemy-minion' }] }),
  makeCard(2, { ...writ, effects: [{ kind: 'freeze', target: 'all-enemy-minions' }] })
])

const fresh = (): MatchState => {
  const state = createMatch(fixtureSetup(1)).state
  state.players[0].aether = 10
  return state
}

const step = (state: MatchState, actor: PlayerIndex, command: Command) => applyCommand(state, actor, command, registry)

const code = (fn: () => unknown): string | null => {
  try {
    fn()
    return null
  } catch (error) {
    return error instanceof DomainError ? error.code : 'other'
  }
}

const mk = (uid: number, n: number): Minion => {
  const { attack, health } = stats(n)
  return { uid, cardId: cid(n), attack, health, maxHealth: health, exhausted: false, keywords: [], onDeath: [] }
}

const endTurn: Command = { type: 'end_turn' }

describe('freeze', () => {
  test('freezes the chosen enemy minion and says so', () => {
    const state = fresh()
    state.players[0].hand = [cid(1)]
    state.players[1].board = [mk(5, 3), mk(6, 3)]
    const { state: next, events } = step(state, 0, { type: 'cast', handIndex: 0, targetUid: 5 })
    expect(next.players[1].board[0]?.frozen).toBe(true)
    expect(next.players[1].board[1]?.frozen).toBeUndefined()
    expect(events).toContainEqual({ type: 'frozen', player: 1, uid: 5 })
  })

  test('a frozen minion cannot attack on its next turn, then thaws', () => {
    const state = fresh()
    state.players[0].hand = [cid(1)]
    state.players[1].board = [mk(5, 3)]
    const frozen = step(state, 0, { type: 'cast', handIndex: 0, targetUid: 5 }).state
    const theirTurn = step(frozen, 0, endTurn).state
    expect(theirTurn.players[1].board[0]).toMatchObject({ exhausted: true })
    expect(theirTurn.players[1].board[0]?.frozen).toBeUndefined()
    const attack: Command = { type: 'attack', attackerUid: 5, target: { kind: 'hero' } }
    expect(code(() => step(theirTurn, 1, attack))).toBe('invalid_command')

    const later = step(step(theirTurn, 1, endTurn).state, 0, endTurn).state
    expect(later.players[1].board[0]?.exhausted).toBe(false)
    expect(step(later, 1, attack).state.players[0].heroHealth).toBe(27)
  })

  test('freeze all hits every enemy minion and none of your own', () => {
    const state = fresh()
    state.players[0].hand = [cid(2)]
    state.players[0].board = [mk(1, 2)]
    state.players[1].board = [mk(5, 3), mk(6, 3)]
    const next = step(state, 0, { type: 'cast', handIndex: 0 }).state
    expect(next.players[1].board.every((minion) => minion.frozen === true)).toBe(true)
    expect(next.players[0].board[0]?.frozen).toBeUndefined()
  })

  test('freeze cannot target a hero', () => {
    expect(() => createRegistry([makeCard(1, { ...writ, effects: [{ kind: 'freeze', target: 'enemy-hero' }] })])).toThrow(DomainError)
  })
})