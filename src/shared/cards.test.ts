import { describe, expect, test } from 'bun:test'
import { EXCHEQUER_CARDS, EXCHEQUER_HERO } from '../content/exchequer'
import { makeCard } from '../rules/test-fixtures'
import { createRegistry } from './cards'
import { DomainError } from './errors'

describe('createRegistry', () => {
  test('rejects duplicate ids', () => {
    expect(() => createRegistry([makeCard(1), makeCard(1)])).toThrow(DomainError)
  })

  test('rejects out-of-range cost', () => {
    expect(() => createRegistry([makeCard(1, { cost: 11 })])).toThrow(DomainError)
    expect(() => createRegistry([makeCard(1, { cost: -1 })])).toThrow(DomainError)
  })

  test('rejects bound cards without valid stats', () => {
    expect(() => createRegistry([makeCard(1, { health: 0 })])).toThrow(DomainError)
    expect(() => createRegistry([makeCard(1, { attack: undefined })])).toThrow(DomainError)
  })

  test('exchequer starter content builds a registry', () => {
    const registry = createRegistry(EXCHEQUER_CARDS)
    expect(registry.size).toBe(EXCHEQUER_CARDS.length)
    for (const card of EXCHEQUER_CARDS) expect(card.faction).toBe(EXCHEQUER_HERO.faction)
  })
})