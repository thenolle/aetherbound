import { describe, expect, test } from 'bun:test'
import { createMatch } from '../rules/engine'
import { createRegistry } from '../shared/cards'
import { validateDeck } from '../shared/deck'
import { BRASSWRIGHT_CARDS, BRASSWRIGHT_DECK, BRASSWRIGHT_HERO } from './brasswright'
import { BRIARTHORN_CARDS } from './briarthorn'
import { BRINE_LOCK_CARDS } from './brine-lock'
import { CHOIR_CARDS } from './choir'
import { CINDER_VANE_CARDS } from './cinder-vane'
import { EXCHEQUER_CARDS } from './exchequer'

const all = [...EXCHEQUER_CARDS, ...BRINE_LOCK_CARDS, ...BRIARTHORN_CARDS, ...CHOIR_CARDS, ...CINDER_VANE_CARDS, ...BRASSWRIGHT_CARDS]
const registry = createRegistry(all)

describe('brasswright guild', () => {
  test('six factions share one registry and every summon matches the automaton token', () => {
    expect(registry.size).toBe(all.length)
    expect(registry.get('brass-automaton')?.token).toBe(true)
    expect(BRASSWRIGHT_CARDS.every((card) => card.faction === 'brasswright')).toBe(true)
  })

  test('the starter list is a legal thirty-card deck for the guild hero', () => {
    expect(BRASSWRIGHT_DECK).toHaveLength(30)
    expect(validateDeck(BRASSWRIGHT_DECK, BRASSWRIGHT_HERO.faction, registry)).toEqual([])
  })

  test('a match can be created with guild decks and overclock is a paid surge', () => {
    const side = { hero: BRASSWRIGHT_HERO, deck: BRASSWRIGHT_DECK }
    const state = createMatch({ seed: 9, registry, players: [side, side] }).state
    expect(state.players[0].ability).toEqual({ cost: 2, effects: [{ kind: 'surge', amount: 3 }] })
  })
})