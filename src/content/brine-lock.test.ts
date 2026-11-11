import { describe, expect, test } from 'bun:test'
import { createMatch } from '../rules/engine'
import { createRegistry } from '../shared/cards'
import { validateDeck } from '../shared/deck'
import { BRINE_LOCK_CARDS, BRINE_LOCK_DECK, BRINE_LOCK_HERO } from './brine-lock'
import { EXCHEQUER_CARDS } from './exchequer'

const registry = createRegistry([...EXCHEQUER_CARDS, ...BRINE_LOCK_CARDS])

describe('brine-lock cartel', () => {
  test('both factions share one registry with distinct ids', () => {
    expect(registry.size).toBe(EXCHEQUER_CARDS.length + BRINE_LOCK_CARDS.length)
    for (const card of BRINE_LOCK_CARDS) expect(card.faction).toBe('brine-lock')
  })

  test('the starter list is a legal thirty-card deck for the cartel hero', () => {
    expect(BRINE_LOCK_DECK).toHaveLength(30)
    expect(validateDeck(BRINE_LOCK_DECK, BRINE_LOCK_HERO.faction, registry)).toEqual([])
  })

  test('a match can be created with cartel decks on both sides', () => {
    const side = { hero: BRINE_LOCK_HERO, deck: BRINE_LOCK_DECK }
    expect(createMatch({ seed: 4, registry, players: [side, side] }).state.turn).toBe(1)
  })
})