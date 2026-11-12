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
import { GLASS_EYE_CARDS } from './glass-eye'
import { LANTERN_BEARERS_CARDS, LANTERN_BEARERS_DECK, LANTERN_BEARERS_HERO } from './lantern-bearers'

const all = [
  ...EXCHEQUER_CARDS,
  ...BRINE_LOCK_CARDS,
  ...BRASSWRIGHT_CARDS,
  ...BRIARTHORN_CARDS,
  ...CHOIR_CARDS,
  ...CINDER_VANE_CARDS,
  ...GLASS_EYE_CARDS,
  ...LANTERN_BEARERS_CARDS
]
const registry = createRegistry(all)

describe('lantern-bearers of sol', () => {
  test('all eight launch factions share one registry', () => {
    expect(registry.size).toBe(all.length)
    expect(LANTERN_BEARERS_CARDS.every((card) => card.faction === 'lantern-bearers')).toBe(true)
  })

  test('the starter list is a legal thirty-card deck for the lamp-bearer hero', () => {
    expect(LANTERN_BEARERS_DECK).toHaveLength(30)
    expect(validateDeck(LANTERN_BEARERS_DECK, LANTERN_BEARERS_HERO.faction, registry)).toEqual([])
  })

  test('a match can be created with lantern-bearer decks on both sides', () => {
    const side = { hero: LANTERN_BEARERS_HERO, deck: LANTERN_BEARERS_DECK }
    const state = createMatch({ seed: 12, registry, players: [side, side] }).state
    expect(state.players[0].healed).toBe(0)
  })
})