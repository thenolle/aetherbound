import { describe, expect, test } from 'bun:test'
import { createMatch } from '../rules/engine'
import { createRegistry } from '../shared/cards'
import { validateDeck } from '../shared/deck'
import { BRIARTHORN_CARDS } from './briarthorn'
import { BRINE_LOCK_CARDS } from './brine-lock'
import { CHOIR_CARDS } from './choir'
import { CINDER_VANE_CARDS, CINDER_VANE_DECK, CINDER_VANE_HERO } from './cinder-vane'
import { EXCHEQUER_CARDS } from './exchequer'

const registry = createRegistry([...EXCHEQUER_CARDS, ...BRINE_LOCK_CARDS, ...BRIARTHORN_CARDS, ...CHOIR_CARDS, ...CINDER_VANE_CARDS])

describe('cinder-vane legion', () => {
  test('five factions share one registry', () => {
    expect(registry.size).toBe(EXCHEQUER_CARDS.length + BRINE_LOCK_CARDS.length + BRIARTHORN_CARDS.length + CHOIR_CARDS.length + CINDER_VANE_CARDS.length)
    expect(CINDER_VANE_CARDS.every((card) => card.faction === 'cinder-vane')).toBe(true)
  })

  test('the starter list is a legal thirty-card deck for the legion hero', () => {
    expect(CINDER_VANE_DECK).toHaveLength(30)
    expect(validateDeck(CINDER_VANE_DECK, CINDER_VANE_HERO.faction, registry)).toEqual([])
  })

  test('a match can be created with legion decks and the free hero ability is accepted', () => {
    const side = { hero: CINDER_VANE_HERO, deck: CINDER_VANE_DECK }
    const state = createMatch({ seed: 8, registry, players: [side, side] }).state
    expect(state.players[0].ability.cost).toBe(0)
  })
})