import { describe, expect, test } from 'bun:test'
import { createRegistry } from '../shared/cards'
import { DomainError } from '../shared/errors'
import { applyCommand, createMatch } from './engine'
import { cid, fixtureSetup, makeCard } from './test-fixtures'
import type { Command, MatchState, Minion, PlayerIndex } from './types'

const writ = { family: 'writ', attack: undefined, health: undefined, cost: 1 } as const
const token = { token: true, cost: 0, attack: 1, health: 1 } as const

const registry = createRegistry([
  makeCard(9, token),
  makeCard(1, { onPlay: [{ kind: 'summon', cardId: cid(9), attack: 1, health: 1, count: 2 }] }),
  makeCard(2, { ...writ, effects: [{ kind: 'blight', amount: 2, target: 'chosen-enemy-minion' }] })
])

const fresh = (): MatchState => {
  const state = createMatch(fixtureSetup(1)).state
  state.players[0].aether = 10
  return state
}

const step = (state: MatchState, actor: PlayerIndex, command: Command) => applyCommand(state, actor, command, registry)

const mk = (uid: number, attack: number, health: number, extra: Partial<Minion> = {}): Minion => ({ uid, cardId: cid(1), attack, health, maxHealth: health, exhausted: false, keywords: [], onDeath: [], ...extra })

const endTurn: Command = { type: 'end_turn' }

describe('summon', () => {
  test('summoned tokens join the board tired, in order, with fresh ids', () => {
    const state = fresh()
    state.players[0].hand = [cid(1)]
    const { state: next, events } = step(state, 0, { type: 'play', handIndex: 0, position: 0 })
    expect(next.players[0].board.map((minion) => minion.uid)).toEqual([1, 2, 3])
    expect(next.players[0].board.slice(1).every((minion) => minion.exhausted && minion.cardId === cid(9))).toBe(true)
    expect(events.filter((event) => event.type === 'minion_summoned')).toHaveLength(2)
  })

  test('summoning stops when the seven wards are full', () => {
    const state = fresh()
    state.players[0].board = [1, 2, 3, 4, 5].map((uid) => mk(uid + 10, 1, 1))
    state.players[0].hand = [cid(1)]
    const { state: next, events } = step(state, 0, { type: 'play', handIndex: 0, position: 0 })
    expect(next.players[0].board).toHaveLength(7)
    expect(events.filter((event) => event.type === 'minion_summoned')).toHaveLength(1)
  })

  test('a summon that does not match a token card is rejected when the registry is built', () => {
    const bad = makeCard(1, { onPlay: [{ kind: 'summon', cardId: cid(9), attack: 5, health: 1, count: 1 }] })
    expect(() => createRegistry([makeCard(9, token), bad])).toThrow(DomainError)
    expect(() => createRegistry([bad])).toThrow(DomainError)
  })
})

describe('blight', () => {
  test('stacks add up and are capped', () => {
    const state = fresh()
    state.players[0].hand = [cid(2), cid(2), cid(2)]
    state.players[1].board = [mk(5, 1, 20)]
    let next = state
    for (let cast = 0; cast < 3; cast += 1) next = step(next, 0, { type: 'cast', handIndex: 0, targetUid: 5 }).state
    expect(next.players[1].board[0]?.blight).toBe(5)
  })

  test('it hurts its owner at the start of their turn and wears down by one each time', () => {
    const state = fresh()
    state.players[1].board = [mk(5, 1, 20, { blight: 2 })]
    const first = step(state, 0, endTurn).state
    expect(first.players[1].board[0]).toMatchObject({ health: 18, blight: 1 })
    const second = step(step(first, 1, endTurn).state, 0, endTurn).state
    expect(second.players[1].board[0]?.health).toBe(17)
    expect(second.players[1].board[0]?.blight).toBeUndefined()
  })

  test('a minion that dies of blight is removed and its death effects fire', () => {
    const state = fresh()
    state.players[1].board = [mk(5, 1, 1, { blight: 1, onDeath: [{ kind: 'damage', amount: 2, target: 'enemy-hero' }] })]
    const { state: next, events } = step(state, 0, endTurn)
    expect(next.players[1].board).toHaveLength(0)
    expect(next.players[0].heroHealth).toBe(28)
    expect(events).toContainEqual({ type: 'minion_died', player: 1, uid: 5 })
  })
})

describe('grows', () => {
  test('survivors of both sides grow once per minion that died, but the dead do not', () => {
    const state = fresh()
    state.players[0].board = [mk(1, 3, 1), mk(2, 1, 3, { grows: { attack: 1, health: 0 } })]
    state.players[1].board = [mk(5, 1, 1), mk(6, 1, 4, { grows: { attack: 0, health: 2 } })]
    const { state: next, events } = step(state, 0, { type: 'attack', attackerUid: 1, target: { kind: 'minion', uid: 5 } })
    expect(next.players[0].board).toHaveLength(1)
    expect(next.players[0].board[0]).toMatchObject({ uid: 2, attack: 3 })
    expect(next.players[1].board[0]).toMatchObject({ uid: 6, health: 8, maxHealth: 8 })
    expect(events.filter((event) => event.type === 'grew')).toHaveLength(2)
  })
})