import type { Database } from 'bun:sqlite'
import { withTransaction } from './database'

type Prepared = ReturnType<Database['prepare']>

export type Balances = Readonly<{ packs: number, dust: number }>

export type StoredDeck = Readonly<{ id: string, name: string, heroId: string, cards: readonly string[], updatedAt: number }>

export type DeckDraft = Readonly<{ id: string, name: string, heroId: string, cards: readonly string[] }>

export type PackCard = Readonly<{ id: string, duplicate: boolean }>

export type PackResult = Readonly<{ openingId: string, cards: readonly PackCard[], dustGained: number, balances: Balances }>

export type PackPlan = Readonly<{
  tableVersion: number
  roll: (seed: number) => readonly string[]
  limits: (cardId: string) => Readonly<{ cap: number, dust: number }>
}>

type DeckRow = { id: string, name: string, hero_id: string, cards: string, updated_at: number }

function parseCards(text: string): string[] {
  const value: unknown = JSON.parse(text)
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string')) {
    throw new Error('corrupt cards column')
  }
  return value
}

const toDeck = (row: DeckRow): StoredDeck => ({
  id: row.id,
  name: row.name,
  heroId: row.hero_id,
  cards: parseCards(row.cards),
  updatedAt: row.updated_at
})

export class EconomyStore {
  private readonly db: Database
  private readonly now: () => number
  private readonly selectCopies: Prepared
  private readonly upsertCopies: Prepared
  private readonly insertGrant: Prepared
  private readonly ensureWallet: Prepared
  private readonly selectWallet: Prepared
  private readonly addWallet: Prepared
  private readonly spendPack: Prepared
  private readonly insertOpening: Prepared
  private readonly upsertDeck: Prepared
  private readonly selectDecks: Prepared
  private readonly selectDeck: Prepared
  private readonly deleteDeckRow: Prepared
  private readonly clearActive: Prepared
  private readonly setActive: Prepared
  private readonly selectActive: Prepared

  constructor(db: Database, now: () => number) {
    this.db = db
    this.now = now
    this.selectCopies = db.prepare('SELECT card_id, copies FROM collection WHERE account_id = ?1')
    this.upsertCopies = db.prepare(
      'INSERT INTO collection (account_id, card_id, copies) VALUES (?1, ?2, ?3) ON CONFLICT (account_id, card_id) DO UPDATE SET copies = copies + excluded.copies'
    )
    this.insertGrant = db.prepare('INSERT OR IGNORE INTO grants (account_id, grant_key, created_at) VALUES (?1, ?2, ?3)')
    this.ensureWallet = db.prepare('INSERT OR IGNORE INTO wallets (account_id) VALUES (?1)')
    this.selectWallet = db.prepare('SELECT packs, dust FROM wallets WHERE account_id = ?1')
    this.addWallet = db.prepare('UPDATE wallets SET packs = packs + ?2, dust = dust + ?3 WHERE account_id = ?1')
    this.spendPack = db.prepare('UPDATE wallets SET packs = packs - 1 WHERE account_id = ?1 AND packs > 0')
    this.insertOpening = db.prepare(
      'INSERT INTO pack_openings (id, account_id, table_version, seed, cards, dust_gained, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
    )
    this.upsertDeck = db.prepare(
      `INSERT INTO decks (id, account_id, name, hero_id, cards, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, hero_id = excluded.hero_id, cards = excluded.cards, updated_at = excluded.updated_at
       WHERE decks.account_id = excluded.account_id`
    )
    this.selectDecks = db.prepare('SELECT id, name, hero_id, cards, updated_at FROM decks WHERE account_id = ?1 ORDER BY updated_at DESC')
    this.selectDeck = db.prepare('SELECT id, name, hero_id, cards, updated_at FROM decks WHERE id = ?1 AND account_id = ?2')
    this.deleteDeckRow = db.prepare('DELETE FROM decks WHERE id = ?1 AND account_id = ?2')
    this.clearActive = db.prepare('UPDATE accounts SET active_deck_id = NULL WHERE id = ?1 AND active_deck_id = ?2')
    this.setActive = db.prepare('UPDATE accounts SET active_deck_id = ?2 WHERE id = ?1')
    this.selectActive = db.prepare('SELECT active_deck_id FROM accounts WHERE id = ?1')
  }

  collection(accountId: string): Map<string, number> {
    const rows = this.selectCopies.all(accountId) as { card_id: string, copies: number }[]
    return new Map(rows.map((row) => [row.card_id, row.copies]))
  }

  balances(accountId: string): Balances {
    return (this.selectWallet.get(accountId) as Balances | null) ?? { packs: 0, dust: 0 }
  }

  ensureStarter(accountId: string, cards: readonly string[]): boolean {
    return withTransaction(this.db, () => {
      this.ensureWallet.run(accountId)
      if (this.insertGrant.run(accountId, 'starter', this.now()).changes === 0) return false
      const counts = new Map<string, number>()
      for (const id of cards) counts.set(id, (counts.get(id) ?? 0) + 1)
      for (const [id, copies] of counts) this.upsertCopies.run(accountId, id, copies)
      return true
    })
  }

  claimDaily(accountId: string, dayKey: string): boolean {
    return withTransaction(this.db, () => {
      this.ensureWallet.run(accountId)
      if (this.insertGrant.run(accountId, `daily:${dayKey}`, this.now()).changes === 0) return false
      this.addWallet.run(accountId, 1, 0)
      return true
    })
  }

  openPack(accountId: string, plan: PackPlan): PackResult | null {
    return withTransaction(this.db, () => {
      this.ensureWallet.run(accountId)
      if (this.spendPack.run(accountId).changes === 0) return null
      const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1
      const rolled = plan.roll(seed)
      const owned = this.collection(accountId)
      const cards: PackCard[] = []
      let dustGained = 0
      for (const cardId of rolled) {
        const { cap, dust } = plan.limits(cardId)
        const have = owned.get(cardId) ?? 0
        if (have < cap) {
          owned.set(cardId, have + 1)
          this.upsertCopies.run(accountId, cardId, 1)
          cards.push({ id: cardId, duplicate: false })
        } else {
          dustGained += dust
          cards.push({ id: cardId, duplicate: true })
        }
      }
      if (dustGained > 0) this.addWallet.run(accountId, 0, dustGained)
      const openingId = crypto.randomUUID()
      this.insertOpening.run(openingId, accountId, plan.tableVersion, seed, JSON.stringify(rolled), dustGained, this.now())
      return { openingId, cards, dustGained, balances: this.balances(accountId) }
    })
  }

  listDecks(accountId: string): StoredDeck[] {
    return (this.selectDecks.all(accountId) as DeckRow[]).map(toDeck)
  }

  saveDeck(accountId: string, draft: DeckDraft, maxDecks: number): StoredDeck {
    return withTransaction(this.db, () => {
      const existing = this.selectDeck.get(draft.id, accountId) as DeckRow | null
      if (existing === null && this.listDecks(accountId).length >= maxDecks) throw new Error('deck limit reached')
      const result = this.upsertDeck.run(draft.id, accountId, draft.name, draft.heroId, JSON.stringify(draft.cards), this.now())
      if (result.changes === 0) throw new Error('deck belongs to another account')
      const saved = this.selectDeck.get(draft.id, accountId) as DeckRow | null
      if (saved === null) throw new Error('deck vanished after saving')
      return toDeck(saved)
    })
  }

  deleteDeck(accountId: string, deckId: string): boolean {
    return withTransaction(this.db, () => {
      this.clearActive.run(accountId, deckId)
      return this.deleteDeckRow.run(deckId, accountId).changes > 0
    })
  }

  setActiveDeck(accountId: string, deckId: string): boolean {
    if ((this.selectDeck.get(deckId, accountId) as DeckRow | null) === null) return false
    this.setActive.run(accountId, deckId)
    return true
  }

  activeDeck(accountId: string): StoredDeck | null {
    const row = this.selectActive.get(accountId) as { active_deck_id: string | null } | null
    if (row === null || row.active_deck_id === null) return null
    const deck = this.selectDeck.get(row.active_deck_id, accountId) as DeckRow | null
    return deck === null ? null : toDeck(deck)
  }
}