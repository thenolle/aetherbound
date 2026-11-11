import type { ContentLookup } from '../persistence/restore'
import type { EconomyStore, StoredDeck } from '../persistence/economy-store'
import type { MatchSetup, PlayerSetup } from '../rules/engine'
import type { HeroDefinition } from '../shared/cards'
import { validateDeck } from '../shared/deck'
import { DomainError } from '../shared/errors'
import { parseId } from '../shared/ids'
import type { Id } from '../shared/ids'
import { GAME_LIMITS } from '../shared/lexicon'

export type DeckInput = Readonly<{ id?: unknown, name?: unknown, hero?: unknown, cards?: unknown }>

export type StarterKit = Readonly<{ hero: HeroDefinition, deck: readonly Id<'card'>[] }>

export const MAX_DECKS = 20

const MAX_NAME_LENGTH = 32
const UUID_PATTERN = /^[0-9a-f-]{36}$/

function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') throw new DomainError('invalid_command', 'deck name must be text')
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    throw new DomainError('invalid_command', `deck name must be 1 to ${MAX_NAME_LENGTH} characters`)
  }
  return name
}

export class DeckService {
  private readonly economy: EconomyStore
  private readonly content: ContentLookup
  private readonly starter: StarterKit

  constructor(economy: EconomyStore, content: ContentLookup, starter: StarterKit) {
    this.economy = economy
    this.content = content
    this.starter = starter
  }

  ensureStarter(accountId: string): void {
    this.economy.ensureStarter(accountId, this.starter.deck)
  }

  save(accountId: string, input: DeckInput): StoredDeck {
    this.ensureStarter(accountId)
    const name = cleanName(input.name)
    const hero = typeof input.hero === 'string' ? this.content.heroes.get(input.hero) : undefined
    if (hero === undefined) throw new DomainError('deck_invalid', 'unknown hero')
    if (
      !Array.isArray(input.cards) ||
      input.cards.length > GAME_LIMITS.deckSize * 2 ||
      !input.cards.every((card): card is string => typeof card === 'string')
    ) {
      throw new DomainError('deck_invalid', 'cards must be a list of card ids')
    }
    const cards = input.cards.map((card) => parseId('card', card))

    const issues = validateDeck(cards, hero.faction, this.content.registry)
    if (issues.length > 0) throw new DomainError('deck_invalid', `deck rejected: ${issues.map((issue) => issue.code).join(', ')}`)

    const owned = this.economy.collection(accountId)
    const needed = new Map<string, number>()
    for (const id of cards) needed.set(id, (needed.get(id) ?? 0) + 1)
    for (const [id, count] of needed) {
      if ((owned.get(id) ?? 0) < count) throw new DomainError('deck_invalid', `you do not own enough copies of ${id}`)
    }

    if (input.id !== undefined && (typeof input.id !== 'string' || !UUID_PATTERN.test(input.id))) {
      throw new DomainError('invalid_command', 'invalid deck id')
    }
    const id = input.id ?? crypto.randomUUID()
    try {
      return this.economy.saveDeck(accountId, { id, name, heroId: hero.id, cards }, MAX_DECKS)
    } catch (error) {
      throw new DomainError('invalid_command', error instanceof Error ? error.message : 'could not save the deck')
    }
  }

  setupFor(accounts: readonly [string, string]): MatchSetup {
    const side = (accountId: string): PlayerSetup => {
      this.ensureStarter(accountId)
      const active = this.economy.activeDeck(accountId)
      const hero = active === null ? undefined : this.content.heroes.get(active.heroId)
      if (active === null || hero === undefined) return { hero: this.starter.hero, deck: this.starter.deck }
      return { hero, deck: active.cards.map((card) => parseId('card', card)) }
    }
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1
    return { seed, registry: this.content.registry, players: [side(accounts[0]), side(accounts[1])] }
  }
}