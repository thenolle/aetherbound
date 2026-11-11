import { beforeEach, describe, expect, test } from 'bun:test'
import { SqliteAccountStore } from '../persistence/account-store'
import { migrate, openDatabase } from '../persistence/database'
import { EconomyStore } from '../persistence/economy-store'
import { MIGRATIONS } from '../persistence/migrations'
import { cid, fixtureDeck, fixtureHero, fixtureRegistry } from '../rules/test-fixtures'
import { DomainError } from '../shared/errors'
import { DeckService, MAX_DECKS } from './decks'

const content = { registry: fixtureRegistry, heroes: new Map([[fixtureHero.id, fixtureHero]]) }

let economy: EconomyStore
let alice: string
let bob: string
let carol: string

beforeEach(() => {
  const db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  const accounts = new SqliteAccountStore(db, () => 1000)
  economy = new EconomyStore(db, () => 1000)
  alice = accounts.upsertGoogleAccount('alice', 'Alice').id
  bob = accounts.upsertGoogleAccount('bob', 'Bob').id
  carol = accounts.upsertGoogleAccount('carol', 'Carol').id
})

const service = (deck = fixtureDeck) => new DeckService(economy, content, { hero: fixtureHero, deck })
const input = (cards: readonly string[] = fixtureDeck) => ({ name: '  Tax   Season ', hero: fixtureHero.id, cards })

describe('DeckService', () => {
  test('saves a legal owned deck with a cleaned name and lists it', () => {
    const decks = service()
    const saved = decks.save(alice, input())
    expect(saved.name).toBe('Tax Season')
    expect(saved.cards).toHaveLength(30)
    expect(economy.listDecks(alice)).toHaveLength(1)
    expect(decks.save(alice, { ...input(), id: saved.id, name: 'Renamed' }).name).toBe('Renamed')
    expect(economy.listDecks(alice)).toHaveLength(1)
  })

  test('rejects illegal, unowned and malformed decks', () => {
    const decks = service()
    const code = (fn: () => unknown): string | null => {
      try {
        fn()
        return null
      } catch (error) {
        return error instanceof DomainError ? error.code : 'other'
      }
    }
    expect(code(() => decks.save(alice, input(fixtureDeck.slice(1))))).toBe('deck_invalid')
    expect(code(() => decks.save(alice, { ...input(), hero: 'nobody' }))).toBe('deck_invalid')
    expect(code(() => decks.save(alice, { ...input(), cards: 'not a list' }))).toBe('deck_invalid')
    expect(code(() => decks.save(alice, { ...input(), name: '   ' }))).toBe('invalid_command')
    expect(code(() => decks.save(alice, { ...input(), id: 'nope' }))).toBe('invalid_command')
    expect(code(() => service(fixtureDeck.slice(0, 24)).save(carol, input()))).toBe('deck_invalid')
    const stolen = service().save(alice, input()).id
    expect(code(() => decks.save(bob, { ...input(), id: stolen }))).toBe('invalid_command')
  })

  test('the number of decks per account is limited', () => {
    const decks = service()
    for (let index = 0; index < MAX_DECKS; index += 1) decks.save(alice, { ...input(), name: `Deck ${index}` })
    expect(() => decks.save(alice, input())).toThrow(DomainError)
    expect(() => decks.save(bob, input())).not.toThrow()
  })

  test('matches use the active deck and fall back to the starter deck', () => {
    const decks = service()
    const custom = [...fixtureDeck.slice(2), cid(1), cid(1)]
    const saved = decks.save(alice, input(custom))
    economy.setActiveDeck(alice, saved.id)
    const setup = decks.setupFor([alice, bob])
    expect(setup.players[0].deck).toEqual(custom)
    expect(setup.players[1].deck).toEqual(fixtureDeck)
    expect(setup.players[1].hero.id).toBe(fixtureHero.id)
  })
})