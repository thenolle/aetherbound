import { describe, expect, test } from 'bun:test'
import { createRegistry } from '../shared/cards'
import { validateDeck } from '../shared/deck'
import { EXCHEQUER_CARDS, EXCHEQUER_DECK, EXCHEQUER_HERO } from './exchequer'

describe('exchequer starter deck', () => {
  test('has exactly thirty cards', () => {
    expect(EXCHEQUER_DECK).toHaveLength(30)
  })

  test('is legal for the exchequer hero', () => {
    const registry = createRegistry(EXCHEQUER_CARDS)
    expect(validateDeck(EXCHEQUER_DECK, EXCHEQUER_HERO.faction, registry)).toEqual([])
  })
})