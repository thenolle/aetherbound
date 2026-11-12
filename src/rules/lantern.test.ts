import { describe, expect, test } from 'bun:test'
import type { HeroDefinition } from '../shared/cards'
import { createRegistry } from '../shared/cards'
import { DomainError } from '../shared/errors'
import { applyCommand, createMatch } from './engine'
import { cid, fixtureDeck, fixtureHero, fixtureRegistry, fixtureSetup, makeCard } from './test-fixtures'
import type { Command, MatchState, Minion, PlayerIndex } from './types'

const writ = { family: 'writ', attack: undefined, health: undefined, cost: 1 } as const

const registry = createRegistry([
  makeCard(1, { ...writ, effects: [{ kind: 'heal', amount: 5, target: 'own-hero' }] }),
  makeCard(2, { ...writ, effects: [{ kind: 'if_healed', threshold: 4, then: [{ kind: 'damage', amount: 3, target: 'enemy-hero' }, { kind: 'draw', count: 1 }] }] }),
  makeCard(3, { ...writ, effects: [{ kind: 'ward' }] }),
  makeCard(4, { keywords: ['glass-ward'] }),
  makeCard(5, { ...writ, effects: [{ kind: 'damage', amount: 2, target: 'chosen-enemy-minion' }] })
])

const fresh = (): MatchState => {
  const state = createMatch(fixtureSetup(1)).state
  state.players[0].aether = 10
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

describe('healed counter', () => {
  test('counts the healing actually received and nothing at full health', () => {
    const state = fresh()
    state.players[0].hand = [cid(1), cid(1)]
    state.players[0].heroHealth = 28
    const first = step(state, 0, { type: 'cast', handIndex: 0 }).state
    expect(first.players[0].healed).toBe(2)
    const second = step(first, 0, { type: 'cast', handIndex: 0 }).state
    expect(second.players[0].healed).toBe(2)
  })
})

describe('miracles', () => {
  test('the payoff only runs once the threshold has been reached', () => {
    const below = fresh()
    below.players[0].hand = [cid(2)]
    below.players[0].healed = 3
    expect(step(below, 0, { type: 'cast', handIndex: 0 }).state.players[1].heroHealth).toBe(30)

    const reached = fresh()
    reached.players[0].hand = [cid(2)]
    reached.players[0].healed = 4
    const deckBefore = reached.players[0].deck.length
    const next = step(reached, 0, { type: 'cast', handIndex: 0 }).state
    expect(next.players[1].heroHealth).toBe(27)
    expect(next.players[0].deck).toHaveLength(deckBefore - 1)
  })
})

describe('glass-ward', () => {
  test('a warded minion shrugs off the first damage from an effect and then takes the second', () => {
    const state = fresh()
    state.players[0].hand = [cid(5), cid(5)]
    state.players[1].board = [mk(5, 1, 6, { warded: true })]
    const first = step(state, 0, { type: 'cast', handIndex: 0, targetUid: 5 })
    expect(first.state.players[1].board[0]).toMatchObject({ health: 6 })
    expect(first.state.players[1].board[0]?.warded).toBeUndefined()
    expect(first.events).toContainEqual({ type: 'ward_broken', player: 1, uid: 5 })
    const second = step(first.state, 0, { type: 'cast', handIndex: 0, targetUid: 5 })
    expect(second.state.players[1].board[0]?.health).toBe(4)
  })

  test('combat damage is prevented too, but the attacker still takes the return blow', () => {
    const state = fresh()
    state.players[0].board = [mk(1, 3, 5)]
    state.players[1].board = [mk(5, 2, 4, { warded: true })]
    const next = step(state, 0, { type: 'attack', attackerUid: 1, target: { kind: 'minion', uid: 5 } }).state
    expect(next.players[1].board[0]?.health).toBe(4)
    expect(next.players[1].board[0]?.warded).toBeUndefined()
    expect(next.players[0].board[0]?.health).toBe(3)
  })

  test('the keyword wards a minion as it enters and the ward effect wards everything you control', () => {
    const state = fresh()
    state.players[0].hand = [cid(4)]
    const played = step(state, 0, { type: 'play', handIndex: 0, position: 0 }).state
    expect(played.players[0].board[0]?.warded).toBe(true)

    const bare = fresh()
    bare.players[0].hand = [cid(3)]
    bare.players[0].board = [mk(1, 1, 1), mk(2, 1, 1)]
    bare.players[1].board = [mk(5, 1, 1)]
    const next = step(bare, 0, { type: 'cast', handIndex: 0 }).state
    expect(next.players[0].board.every((minion) => minion.warded === true)).toBe(true)
    expect(next.players[1].board[0]?.warded).toBeUndefined()
  })
})

describe('validation and the hero ability', () => {
  test('miracles cannot nest, need a sane threshold, and nested summons must match a token', () => {
    const nested = { kind: 'if_healed', threshold: 2, then: [{ kind: 'if_healed', threshold: 3, then: [{ kind: 'draw', count: 1 }] }] } as const
    expect(() => createRegistry([makeCard(1, { ...writ, effects: [nested] })])).toThrow(DomainError)
    expect(() => createRegistry([makeCard(1, { ...writ, effects: [{ kind: 'if_healed', threshold: 0, then: [{ kind: 'draw', count: 1 }] }] })])).toThrow(DomainError)
    const badSummon = makeCard(1, { ...writ, effects: [{ kind: 'if_healed', threshold: 2, then: [{ kind: 'summon', cardId: cid(9), attack: 1, health: 1, count: 1 }] }] })
    expect(() => createRegistry([badSummon])).toThrow(DomainError)
  })

  test('a paid hero ability can heal and feeds the counter', () => {
    const hero: HeroDefinition = {
      ...fixtureHero,
      ability: { name: { en: 'Kindle the Lamp', fr: 'Allumer la Lampe' }, cost: 2, effects: [{ kind: 'heal', amount: 2, target: 'own-hero' }] }
    }
    const state = createMatch({ ...fixtureSetup(1), players: [{ hero, deck: fixtureDeck }, { hero: fixtureHero, deck: fixtureDeck }] }).state
    state.players[0].aether = 2
    state.players[0].heroHealth = 25
    const next = applyCommand(state, 0, { type: 'hero_ability' }, fixtureRegistry).state
    expect(next.players[0]).toMatchObject({ heroHealth: 27, healed: 2 })
  })
})