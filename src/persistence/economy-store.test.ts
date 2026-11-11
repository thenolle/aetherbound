import { beforeEach, describe, expect, test } from 'bun:test'
import { SqliteAccountStore } from './account-store'
import { migrate, openDatabase } from './database'
import { EconomyStore } from './economy-store'
import type { PackPlan } from './economy-store'
import { MIGRATIONS } from './migrations'

let db: ReturnType<typeof openDatabase>
let economy: EconomyStore
let alice: string
let bob: string

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  const accounts = new SqliteAccountStore(db, () => 1000)
  economy = new EconomyStore(db, () => 1000)
  alice = accounts.upsertGoogleAccount('alice', 'Alice').id
  bob = accounts.upsertGoogleAccount('bob', 'Bob').id
})

const plan = (cards: string[], cap = 2): PackPlan => ({
  tableVersion: 1,
  roll: () => cards,
  limits: () => ({ cap, dust: 10 })
})

describe('EconomyStore', () => {
  test('the starter collection is granted exactly once', () => {
    expect(economy.ensureStarter(alice, ['a', 'a', 'b'])).toBe(true)
    expect(economy.ensureStarter(alice, ['a', 'a', 'b'])).toBe(false)
    expect(Object.fromEntries(economy.collection(alice))).toEqual({ a: 2, b: 1 })
    expect(economy.collection(bob).size).toBe(0)
  })

  test('the daily pack can be claimed once per day', () => {
    expect(economy.claimDaily(alice, '2026-11-11')).toBe(true)
    expect(economy.claimDaily(alice, '2026-11-11')).toBe(false)
    expect(economy.claimDaily(alice, '2026-11-12')).toBe(true)
    expect(economy.balances(alice).packs).toBe(2)
  })

  test('opening a pack spends it, adds copies up to the cap and turns the rest into dust', () => {
    economy.claimDaily(alice, 'd1')
    const result = economy.openPack(alice, plan(['a', 'a', 'a', 'b'], 2))
    expect(result?.cards.map((card) => card.duplicate)).toEqual([false, false, true, false])
    expect(result?.dustGained).toBe(10)
    expect(result?.balances).toEqual({ packs: 0, dust: 10 })
    expect(Object.fromEntries(economy.collection(alice))).toEqual({ a: 2, b: 1 })
    expect((db.query('SELECT COUNT(*) AS n FROM pack_openings').get() as { n: number }).n).toBe(1)
  })

  test('opening without a pack, or with a failing roll, changes nothing', () => {
    expect(economy.openPack(alice, plan(['a']))).toBeNull()
    economy.claimDaily(alice, 'd1')
    const failing: PackPlan = { tableVersion: 1, limits: () => ({ cap: 2, dust: 1 }), roll: () => { throw new Error('boom') } }
    expect(() => economy.openPack(alice, failing)).toThrow('boom')
    expect(economy.balances(alice).packs).toBe(1)
    expect(economy.collection(alice).size).toBe(0)
  })

  test('decks are scoped to their account, limited in number and one can be active', () => {
    const draft = { id: 'deck-1', name: 'Taxes', heroId: 'hero', cards: ['a', 'b'] }
    expect(economy.saveDeck(alice, draft, 2).cards).toEqual(['a', 'b'])
    expect(economy.saveDeck(alice, { ...draft, name: 'Taxes II' }, 2).name).toBe('Taxes II')
    expect(() => economy.saveDeck(bob, draft, 2)).toThrow('another account')
    economy.saveDeck(alice, { ...draft, id: 'deck-2' }, 2)
    expect(() => economy.saveDeck(alice, { ...draft, id: 'deck-3' }, 2)).toThrow('limit')

    expect(economy.setActiveDeck(bob, 'deck-1')).toBe(false)
    expect(economy.setActiveDeck(alice, 'deck-1')).toBe(true)
    expect(economy.activeDeck(alice)?.id).toBe('deck-1')
    expect(economy.deleteDeck(bob, 'deck-1')).toBe(false)
    expect(economy.deleteDeck(alice, 'deck-1')).toBe(true)
    expect(economy.activeDeck(alice)).toBeNull()
    expect(economy.listDecks(alice).map((deck) => deck.id)).toEqual(['deck-2'])
  })
})