import { describe, expect, test } from 'bun:test'
import { fixtureDeck, fixtureHero, fixtureRegistry, cid, makeCard } from '../rules/test-fixtures'
import { createRegistry } from './cards'
import { validateDeck } from './deck'
import { parseId } from './ids'

const codes = (deck: readonly string[], registry = fixtureRegistry) => validateDeck(deck, fixtureHero.faction, registry).map((issue) => issue.code)

describe('validateDeck', () => {
  test('accepts a legal thirty-card deck', () => {
    expect(codes(fixtureDeck)).toEqual([])
  })

  test('rejects wrong size', () => {
    expect(codes(fixtureDeck.slice(1))).toContain('wrong_size')
  })

  test('rejects a third copy of an ordinary card', () => {
    expect(codes([...fixtureDeck.slice(0, 29), cid(1)])).toEqual(['too_many_copies'])
  })

  test('limits unique cards to one copy', () => {
    const registry = createRegistry([makeCard(1, { unique: true })])
    expect(codes([cid(1), cid(1)], registry)).toContain('too_many_copies')
    expect(codes([cid(1)], registry)).not.toContain('too_many_copies')
  })

  test('rejects unknown cards', () => {
    expect(codes([...fixtureDeck.slice(0, 29), parseId('card', 'ghost')])).toContain('unknown_card')
  })

  test('rejects cards from another faction but allows neutral', () => {
    const registry = createRegistry([makeCard(1, { faction: 'choir' }), makeCard(2)])
    expect(codes([cid(1)], registry)).toContain('wrong_faction')
    expect(codes([cid(2)], registry)).not.toContain('wrong_faction')
  })
})