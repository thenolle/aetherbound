import { describe, expect, test } from 'bun:test'
import { createRegistry } from '../shared/cards'
import { DomainError } from '../shared/errors'
import { applyCommand, createMatch } from './engine'
import { cid, fixtureSetup, makeCard } from './test-fixtures'
import type { Command, MatchState, Minion, PlayerIndex } from './types'

const writ = { family: 'writ', attack: undefined, health: undefined, cost: 1 } as const

const registry = createRegistry([
  makeCard(9, { token: true, cost: 0, attack: 1, health: 1 }),
  makeCard(1, { ...writ, effects: [{ kind: 'buff', attack: 1, health: 2 }] }),
  makeCard(2, { ...writ, effects: [{ kind: 'forge', attack: 1, durability: 2 }] }),
  makeCard(3, { ...writ, effects: [{ kind: 'summon', cardId: cid(9), attack: 1, health: 1, count: 1 }, { kind: 'buff', attack: 1, health: 1 }] }),
  makeCard(4, { ...writ, effects: [{ kind: 'heal', amount: 5, target: 'all-own-minions' }] })
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

describe('buff', () => {
  test('permanently reinforces every minion you control and nobody else', () => {
    const state = fresh()
    state.players[0].hand = [cid(1)]
    state.players[0].board = [mk(1, 1, 1), mk(2, 2, 2)]
    state.players[1].board = [mk(5, 1, 1)]
    const { state: next, events } = step(state, 0, { type: 'cast', handIndex: 0 })
    expect(next.players[0].board.map((minion) => [minion.attack, minion.health, minion.maxHealth])).toEqual([[2, 3, 3], [3, 4, 4]])
    expect(next.players[1].board[0]).toMatchObject({ attack: 1, health: 1 })
    expect(events.filter((event) => event.type === 'buffed')).toHaveLength(2)
  })

  test('effects resolve in order, so freshly summoned tokens are reinforced too', () => {
    const state = fresh()
    state.players[0].hand = [cid(3)]
    const next = step(state, 0, { type: 'cast', handIndex: 0 }).state
    expect(next.players[0].board).toHaveLength(1)
    expect(next.players[0].board[0]).toMatchObject({ cardId: cid(9), attack: 2, health: 2 })
  })
})

describe('forge', () => {
  test('upgrades an equipped iron and does nothing without one', () => {
    const state = fresh()
    state.players[0].hand = [cid(2), cid(2)]
    const bare = step(state, 0, { type: 'cast', handIndex: 0 })
    expect(bare.state.players[0].weapon).toBeNull()
    expect(bare.events.some((event) => event.type === 'forged')).toBe(false)
    const armed = fresh()
    armed.players[0].hand = [cid(2)]
    armed.players[0].weapon = { cardId: cid(1), attack: 2, durability: 1 }
    const { state: next, events } = step(armed, 0, { type: 'cast', handIndex: 0 })
    expect(next.players[0].weapon).toEqual({ cardId: cid(1), attack: 3, durability: 3 })
    expect(events).toContainEqual({ type: 'forged', player: 0, attack: 3, durability: 3 })
  })
})

describe('own-minion targets', () => {
  test('a heal can cover all your own minions, capped at their maximum', () => {
    const state = fresh()
    state.players[0].hand = [cid(4)]
    state.players[0].board = [mk(1, 1, 4, { health: 1 }), mk(2, 1, 4, { health: 3 })]
    state.players[1].board = [mk(5, 1, 4, { health: 1 })]
    const next = step(state, 0, { type: 'cast', handIndex: 0 }).state
    expect(next.players[0].board.map((minion) => minion.health)).toEqual([4, 4])
    expect(next.players[1].board[0]?.health).toBe(1)
  })
})

describe('validation', () => {
  test('empty or oversized buffs and forges are rejected, and freeze cannot target your own minions', () => {
    expect(() => createRegistry([makeCard(1, { ...writ, effects: [{ kind: 'buff', attack: 0, health: 0 }] })])).toThrow(DomainError)
    expect(() => createRegistry([makeCard(1, { ...writ, effects: [{ kind: 'buff', attack: 10, health: 0 }] })])).toThrow(DomainError)
    expect(() => createRegistry([makeCard(1, { ...writ, effects: [{ kind: 'forge', attack: 0, durability: 0 }] })])).toThrow(DomainError)
    expect(() => createRegistry([makeCard(1, { ...writ, effects: [{ kind: 'freeze', target: 'all-own-minions' }] })])).toThrow(DomainError)
  })
})