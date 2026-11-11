import { createRegistry } from '../shared/cards'
import type { CardDefinition, HeroDefinition } from '../shared/cards'
import { parseId } from '../shared/ids'
import type { Id } from '../shared/ids'
import type { MatchSetup } from './engine'

export const cid = (n: number): Id<'card'> => parseId('card', `test-${String(n).padStart(2, '0')}`)

export const stats = (n: number) => ({
  cost: ((n - 1) % 5) + 1,
  attack: ((n - 1) % 4) + 1,
  health: ((n - 1) % 3) + 1
})

export function makeCard(n: number, overrides: Partial<CardDefinition> = {}): CardDefinition {
  const { cost, attack, health } = stats(n)
  return {
    id: cid(n),
    name: { en: `Test Card ${n}`, fr: `Carte d'essai ${n}` },
    faction: 'neutral',
    family: 'bound',
    rarity: 'common',
    cost,
    unique: false,
    attack,
    health,
    flavor: { en: 'Fixture.', fr: "Donnee d'essai." },
    ...overrides
  }
}

export const fixtureCards: readonly CardDefinition[] = Array.from({ length: 15 }, (_, index) => makeCard(index + 1))

export const fixtureRegistry = createRegistry(fixtureCards)

export const fixtureHero: HeroDefinition = {
  id: parseId('hero', 'test-hero'),
  name: { en: 'Test Hero', fr: "Heros d'essai" },
  title: { en: 'Tester', fr: 'Testeur' },
  faction: 'exchequer',
  health: 30,
  ability: {
    name: { en: 'Test Ability', fr: "Capacite d'essai" },
    cost: 2,
    effects: [{ kind: 'damage', amount: 1, target: 'enemy-hero' }]
  }
}

export const fixtureDeck: readonly Id<'card'>[] = fixtureCards.flatMap((card) => [card.id, card.id])

export const fixtureSetup = (seed: number): MatchSetup => ({
  seed,
  registry: fixtureRegistry,
  players: [
    { hero: fixtureHero, deck: fixtureDeck },
    { hero: fixtureHero, deck: fixtureDeck }
  ]
})