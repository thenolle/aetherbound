import { describe, expect, test } from 'bun:test'
import { createMatch } from '../rules/engine'
import { createRegistry } from '../shared/cards'
import { validateDeck } from '../shared/deck'
import { BRASSWRIGHT_CARDS } from './brasswright'
import { BRIARTHORN_CARDS } from './briarthorn'
import { BRINE_LOCK_CARDS } from './brine-lock'
import { CHOIR_CARDS } from './choir'
import { CINDER_VANE_CARDS } from './cinder-vane'
import { EXCHEQUER_CARDS } from './exchequer'
import { GLASS_EYE_CARDS, GLASS_EYE_DECK, GLASS_EYE_HERO } from './glass-eye'

const all = [...EXCHEQUER_CARDS, ...BRINE_LOCK_CARDS, ...BRIARTHORN_CARDS, ...CHOIR_CARDS, ...CINDER_VANE_CARDS, ...BRASSWRIGHT_CARDS, ...GLASS_EYE_CARDS]
const registry = createRegistry(all)

describe('glass-eye syndicate', () => {
  test('seven factions share one registry', () => {
    expect(registry.size).toBe(all.length)
    expect(GLASS_EYE_CARDS.every((card) => card.faction === 'glass-eye')).toBe(true)
  })

  test('the starter list is a legal thirty-card deck for the syndicate hero', () => {
    expect(GLASS_EYE_DECK).toHaveLength(30)
    expect(validateDeck(GLASS_EYE_DECK, GLASS_EYE_HERO.faction, registry)).toEqual([])
  })

  test('a match can be created with syndicate decks on both sides', () => {
    const side = { hero: GLASS_EYE_HERO, deck: GLASS_EYE_DECK }
    const state = createMatch({ seed: 10, registry, players: [side, side] }).state
    expect(state.players[0].ability.effects).toEqual([{ kind: 'steal', count: 1, take: false }])
  })
})