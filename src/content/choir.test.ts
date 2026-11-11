import { describe, expect, test } from 'bun:test'
import { createMatch } from '../rules/engine'
import { createRegistry } from '../shared/cards'
import { validateDeck } from '../shared/deck'
import { BRIARTHORN_CARDS } from './briarthorn'
import { BRINE_LOCK_CARDS } from './brine-lock'
import { CHOIR_CARDS, CHOIR_DECK, CHOIR_HERO } from './choir'
import { EXCHEQUER_CARDS } from './exchequer'

const registry = createRegistry([...EXCHEQUER_CARDS, ...BRINE_LOCK_CARDS, ...BRIARTHORN_CARDS, ...CHOIR_CARDS])

describe('choir of the bell', () => {
  test('all four factions share one registry and every raise matches the husk token', () => {
    expect(registry.size).toBe(EXCHEQUER_CARDS.length + BRINE_LOCK_CARDS.length + BRIARTHORN_CARDS.length + CHOIR_CARDS.length)
    expect(registry.get('hollow-husk')?.token).toBe(true)
  })

  test('the starter list is a legal thirty-card deck for the choir hero', () => {
    expect(CHOIR_DECK).toHaveLength(30)
    expect(validateDeck(CHOIR_DECK, CHOIR_HERO.faction, registry)).toEqual([])
  })

  test('a match can be created with choir decks and the hero ability is valid', () => {
    const side = { hero: CHOIR_HERO, deck: CHOIR_DECK }
    const state = createMatch({ seed: 6, registry, players: [side, side] }).state
    expect(state.players[0].ability.effects).toEqual([{ kind: 'drain', amount: 1 }])
  })
})