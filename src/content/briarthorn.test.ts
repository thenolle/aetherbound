import { describe, expect, test } from 'bun:test'
import { createRegistry, summonsOf } from '../shared/cards'
import { validateDeck } from '../shared/deck'
import { DomainError } from '../shared/errors'
import { parseId } from '../shared/ids'
import { BRIARTHORN_CARDS, BRIARTHORN_DECK, BRIARTHORN_HERO } from './briarthorn'
import { BRINE_LOCK_CARDS } from './brine-lock'
import { EXCHEQUER_CARDS } from './exchequer'

const registry = createRegistry([...EXCHEQUER_CARDS, ...BRINE_LOCK_CARDS, ...BRIARTHORN_CARDS])

describe('briarthorn parish', () => {
  test('all three factions build one registry and every summon matches a token', () => {
    expect(registry.size).toBe(EXCHEQUER_CARDS.length + BRINE_LOCK_CARDS.length + BRIARTHORN_CARDS.length)
    for (const summon of BRIARTHORN_HERO.ability.effects.flatMap((effect) => (effect.kind === 'summon' ? [effect] : []))) {
      expect(registry.get(summon.cardId)?.token).toBe(true)
    }
    expect(BRIARTHORN_CARDS.flatMap(summonsOf).length).toBeGreaterThan(0)
  })

  test('the starter list is a legal thirty-card deck and tokens can never be put in a deck', () => {
    expect(BRIARTHORN_DECK).toHaveLength(30)
    expect(validateDeck(BRIARTHORN_DECK, BRIARTHORN_HERO.faction, registry)).toEqual([])
    const withToken = [...BRIARTHORN_DECK.slice(0, 29), parseId('card', 'thorn-beast')]
    expect(validateDeck(withToken, BRIARTHORN_HERO.faction, registry).map((issue) => issue.code)).toContain('not_collectible')
  })

  test('a token must exist and match what is summoned', () => {
    const [, ...withoutToken] = BRIARTHORN_CARDS
    expect(() => createRegistry(withoutToken)).toThrow(DomainError)
  })
})