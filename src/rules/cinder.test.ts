import { describe, expect, test } from 'bun:test'
import type { HeroDefinition } from '../shared/cards'
import { createRegistry } from '../shared/cards'
import { DomainError } from '../shared/errors'
import { applyCommand, createMatch } from './engine'
import { cid, fixtureDeck, fixtureHero, fixtureRegistry, fixtureSetup, makeCard } from './test-fixtures'
import type { Command, MatchState, Minion, PlayerIndex } from './types'

const writ = { family: 'writ', attack: undefined, health: undefined, cost: 1 } as const

const registry = createRegistry([
  makeCard(1, { ...writ, effects: [{ kind: 'surge', amount: 4 }] }),
  makeCard(2, { ...writ, effects: [{ kind: 'rupture', count: 2 }] })
])

const fresh = (): MatchState => {
  const state = createMatch(fixtureSetup(1)).state
  state.players[0].aether = 5
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

describe('surge', () => {
  test('adds Aether right now, never past ten, and says so', () => {
    const state = fresh()
    state.players[0].hand = [cid(1), cid(1)]
    const first = step(state, 0, { type: 'cast', handIndex: 0 })
    expect(first.state.players[0].aether).toBe(8)
    expect(first.events).toContainEqual({ type: 'surged', player: 0, amount: 4 })
    const second = step(first.state, 0, { type: 'cast', handIndex: 0 })
    expect(second.state.players[0].aether).toBe(10)
    expect(second.events).toContainEqual({ type: 'surged', player: 0, amount: 3 })
  })
})

describe('rupture', () => {
  test('destroys the weakest minions and hurts the enemy hero by their attack', () => {
    const state = fresh()
    state.players[0].hand = [cid(2)]
    state.players[0].board = [mk(1, 3, 3), mk(2, 1, 1), mk(3, 2, 2)]
    const { state: next, events } = step(state, 0, { type: 'cast', handIndex: 0 })
    expect(next.players[0].board.map((minion) => minion.uid)).toEqual([1])
    expect(next.players[1].heroHealth).toBe(27)
    expect(next.players[0].fallen).toBe(2)
    expect(events.filter((event) => event.type === 'minion_died')).toHaveLength(2)
  })

  test('sacrificed minions still trigger their death effects', () => {
    const state = fresh()
    state.players[0].hand = [cid(2)]
    state.players[0].board = [mk(1, 2, 1, { onDeath: [{ kind: 'damage', amount: 1, target: 'enemy-hero' }] })]
    const next = step(state, 0, { type: 'cast', handIndex: 0 }).state
    expect(next.players[1].heroHealth).toBe(27)
  })

  test('with nothing to sacrifice it does nothing but the card is still spent', () => {
    const state = fresh()
    state.players[0].hand = [cid(2)]
    const next = step(state, 0, { type: 'cast', handIndex: 0 }).state
    expect(next.players[1].heroHealth).toBe(30)
    expect(next.players[0].aether).toBe(4)
    expect(next.players[0].hand).toHaveLength(0)
  })
})

describe('vent valve and validation', () => {
  test('a free hero ability can trade health for Aether once per turn', () => {
    const hero: HeroDefinition = {
      ...fixtureHero,
      ability: { name: { en: 'Vent Valve', fr: 'Ouvrir la Soupape' }, cost: 0, effects: [{ kind: 'damage', amount: 2, target: 'own-hero' }, { kind: 'surge', amount: 2 }] }
    }
    const state = createMatch({
      ...fixtureSetup(1),
      players: [{ hero, deck: fixtureDeck }, { hero: fixtureHero, deck: fixtureDeck }]
    }).state
    state.players[0].aether = 0
    const used = applyCommand(state, 0, { type: 'hero_ability' }, fixtureRegistry).state
    expect(used.players[0]).toMatchObject({ heroHealth: 28, aether: 2 })
    expect(() => applyCommand(used, 0, { type: 'hero_ability' }, fixtureRegistry)).toThrow(DomainError)
  })

  test('the registry rejects out-of-range rupture and surge', () => {
    expect(() => createRegistry([makeCard(1, { ...writ, effects: [{ kind: 'rupture', count: 0 }] })])).toThrow(DomainError)
    expect(() => createRegistry([makeCard(1, { ...writ, effects: [{ kind: 'surge', amount: 11 }] })])).toThrow(DomainError)
  })
})