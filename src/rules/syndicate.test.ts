import { describe, expect, test } from 'bun:test'
import type { HeroDefinition } from '../shared/cards'
import { createRegistry } from '../shared/cards'
import { DomainError } from '../shared/errors'
import { applyCommand, createMatch } from './engine'
import { projectEvent } from './projection'
import { cid, fixtureDeck, fixtureHero, fixtureRegistry, fixtureSetup, makeCard } from './test-fixtures'
import type { Command, MatchState, Minion, PlayerIndex } from './types'

const writ = { family: 'writ', attack: undefined, health: undefined, cost: 1 } as const

const registry = createRegistry([
  makeCard(1, { ...writ, effects: [{ kind: 'steal', count: 2, take: false }] }),
  makeCard(2, { ...writ, effects: [{ kind: 'steal', count: 2, take: true }] }),
  makeCard(3, { ...writ, effects: [{ kind: 'counterfeit' }] })
])

const fresh = (): MatchState => {
  const state = createMatch(fixtureSetup(1)).state
  state.players[0].aether = 10
  state.players[1].deck = [cid(5), cid(6), cid(7)]
  return state
}

const step = (state: MatchState, actor: PlayerIndex, command: Command) => applyCommand(state, actor, command, registry)

const mk = (uid: number, attack: number, health: number, extra: Partial<Minion> = {}): Minion => ({
  uid,
  cardId: cid(8),
  attack,
  health,
  maxHealth: health,
  exhausted: false,
  keywords: [],
  onDeath: [],
  ...extra
})

describe('steal', () => {
  test('copying adds their top cards to your hand in order and leaves their deck alone', () => {
    const state = fresh()
    state.players[0].hand = [cid(1)]
    const next = step(state, 0, { type: 'cast', handIndex: 0 }).state
    expect(next.players[0].hand).toEqual([cid(5), cid(6)])
    expect(next.players[1].deck).toEqual([cid(5), cid(6), cid(7)])
  })

  test('taking removes the cards from their deck, and a full hand loses the extra card quietly', () => {
    const state = fresh()
    state.players[0].hand = [cid(2)]
    const taken = step(state, 0, { type: 'cast', handIndex: 0 }).state
    expect(taken.players[0].hand).toEqual([cid(5), cid(6)])
    expect(taken.players[1].deck).toEqual([cid(7)])
    const crowded = fresh()
    crowded.players[0].hand = [cid(2), ...Array.from({ length: 8 }, () => cid(1))]
    const { state: next, events } = step(crowded, 0, { type: 'cast', handIndex: 0 })
    expect(next.players[0].hand).toHaveLength(9)
    expect(next.players[1].deck).toEqual([cid(7)])
    expect(events.filter((event) => event.type === 'card_stolen')).toHaveLength(1)
    expect(events.some((event) => event.type === 'card_burned')).toBe(false)
  })

  test('an empty deck gives nothing', () => {
    const state = fresh()
    state.players[1].deck = []
    state.players[0].hand = [cid(1)]
    const next = step(state, 0, { type: 'cast', handIndex: 0 }).state
    expect(next.players[0].hand).toEqual([])
  })

  test('only the thief learns which card was stolen', () => {
    const state = fresh()
    state.players[0].hand = [cid(1)]
    const { events } = step(state, 0, { type: 'cast', handIndex: 0 })
    const stolen = events.find((event) => event.type === 'card_stolen')
    if (stolen === undefined) throw new Error('expected a theft')
    expect(projectEvent(stolen, 0)).toEqual({ type: 'card_stolen', player: 0, cardId: cid(5) })
    expect(projectEvent(stolen, 1)).toEqual({ type: 'card_stolen', player: 0, cardId: null })
  })
})

describe('counterfeit', () => {
  test('copies a chosen enemy minion with its stats, keywords and death effects, but tired', () => {
    const state = fresh()
    state.players[0].hand = [cid(3)]
    const original = mk(5, 3, 2, { maxHealth: 4, keywords: ['shield-wall'], onDeath: [{ kind: 'damage', amount: 1, target: 'enemy-hero' }], frozen: true, blight: 2 })
    state.players[1].board = [original]
    const { state: next, events } = step(state, 0, { type: 'cast', handIndex: 0, targetUid: 5 })
    const copy = next.players[0].board[0]
    expect(copy).toMatchObject({ cardId: cid(8), attack: 3, health: 2, maxHealth: 4, keywords: ['shield-wall'], exhausted: true })
    expect(copy?.uid).not.toBe(5)
    expect(copy?.onDeath).toEqual(original.onDeath)
    expect(copy?.onDeath).not.toBe(next.players[1].board[0]?.onDeath)
    expect(copy?.frozen).toBeUndefined()
    expect(copy?.blight).toBeUndefined()
    expect(events).toContainEqual({ type: 'minion_summoned', player: 0, uid: copy?.uid ?? -1, cardId: cid(8) })
  })

  test('it needs a target and does nothing when the board is full', () => {
    const state = fresh()
    state.players[0].hand = [cid(3)]
    state.players[1].board = [mk(5, 3, 3)]
    expect(() => step(state, 0, { type: 'cast', handIndex: 0 })).toThrow(DomainError)
    state.players[0].board = [1, 2, 3, 4, 5, 6, 7].map((uid) => mk(uid + 20, 1, 1))
    const next = step(state, 0, { type: 'cast', handIndex: 0, targetUid: 5 }).state
    expect(next.players[0].board).toHaveLength(7)
  })
})

describe('validation and the hero ability', () => {
  test('bad steal counts are rejected and counterfeit cannot be a snare effect', () => {
    expect(() => createRegistry([makeCard(1, { ...writ, effects: [{ kind: 'steal', count: 0, take: true }] })])).toThrow(DomainError)
    expect(() => createRegistry([makeCard(1, { family: 'snare', attack: undefined, health: undefined, trigger: 'enemy-play', effects: [{ kind: 'counterfeit' }] })])).toThrow(DomainError)
  })

  test('a paid hero ability can copy the top card of their deck', () => {
    const hero: HeroDefinition = {
      ...fixtureHero,
      ability: { name: { en: 'Clip the Coin', fr: 'Rogner la Piece' }, cost: 2, effects: [{ kind: 'steal', count: 1, take: false }] }
    }
    const state = createMatch({ ...fixtureSetup(1), players: [{ hero, deck: fixtureDeck }, { hero: fixtureHero, deck: fixtureDeck }] }).state
    state.players[0].aether = 2
    const top = state.players[1].deck[0]
    const handBefore = state.players[0].hand.length
    const next = applyCommand(state, 0, { type: 'hero_ability' }, fixtureRegistry).state
    expect(next.players[0].hand).toHaveLength(handBefore + 1)
    expect(next.players[0].hand.at(-1)).toBe(top)
    expect(next.players[1].deck[0]).toBe(top)
  })
})