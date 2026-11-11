import { describe, expect, test } from 'bun:test'
import { isValidId } from './ids'
import { BOARDS, BOARD_IDS, CARD_FAMILIES, CARD_FAMILY_IDS, FACTIONS, FACTION_IDS, GAME_LIMITS, KEYWORDS, KEYWORD_IDS, LOCALES, RARITIES, RARITY_IDS, allLexiconNames, localize } from './lexicon'

describe('lexicon', () => {
  test('launch counts match the design bible', () => {
    expect(FACTION_IDS).toHaveLength(8)
    expect(BOARD_IDS).toHaveLength(6)
    expect(CARD_FAMILY_IDS).toHaveLength(6)
    expect(RARITY_IDS).toHaveLength(4)
    expect(GAME_LIMITS).toEqual({ boardSlots: 7, deckSize: 30, maxCopies: 2, maxUniqueCopies: 1, aetherPressureMax: 10 })
  })

  test('registries are keyed by their own ids and ids are valid', () => {
    for (const id of FACTION_IDS) {
      expect(FACTIONS[id].id).toBe(id)
      expect(isValidId(id)).toBe(true)
    }
    for (const id of BOARD_IDS) expect(isValidId(id)).toBe(true)
    expect(Object.keys(CARD_FAMILIES)).toEqual([...CARD_FAMILY_IDS])
    expect(Object.keys(RARITIES)).toEqual([...RARITY_IDS])
    expect(Object.keys(BOARDS)).toEqual([...BOARD_IDS])
  })

  test('keywords are registered with valid ids', () => {
    expect(Object.keys(KEYWORDS)).toEqual([...KEYWORD_IDS])
    for (const id of KEYWORD_IDS) expect(isValidId(id)).toBe(true)
  })

  test('every name exists in every locale', () => {
    for (const name of allLexiconNames()) {
      for (const locale of LOCALES) expect(localize(name, locale).trim().length).toBeGreaterThan(0)
    }
  })

  test('bible-given french names are exact', () => {
    expect(FACTIONS.exchequer.name.fr).toBe("L'Echiquier de la Concorde")
    expect(FACTIONS.brasswright.name.fr).toBe('La Guilde des Cuivriers')
  })
})