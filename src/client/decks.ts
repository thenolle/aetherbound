import type { CardDefinition, CardRegistry, HeroDefinition } from '../shared/cards'
import { validateDeck } from '../shared/deck'
import type { DeckIssue } from '../shared/deck'
import { parseId } from '../shared/ids'
import { GAME_LIMITS } from '../shared/lexicon'
import { button, column, label, list, row } from '../ui/nodes'
import type { ListItem, UiNode } from '../ui/nodes'
import { fieldOf, textOf } from './json'
import type { Api } from './menu'

export type DeckBuilderDeps = Readonly<{
  api: Api
  registry: CardRegistry
  heroes: readonly HeroDefinition[]
  onChange: () => void
  onBack: () => void
}>

const byCostThenName = (a: CardDefinition, b: CardDefinition): number => a.cost - b.cost || a.name.en.localeCompare(b.name.en)

const capOf = (card: CardDefinition): number => (card.unique ? GAME_LIMITS.maxUniqueCopies : GAME_LIMITS.maxCopies)

function describeIssue(issue: DeckIssue, total: number): string {
  if (issue.code === 'wrong_size') return `needs ${GAME_LIMITS.deckSize} cards, has ${total}`
  return `${issue.code.replace(/_/g, ' ')}${issue.cardId === undefined ? '' : ` (${issue.cardId})`}`
}

export class DeckBuilder {
  private readonly deps: DeckBuilderDeps
  private owned = new Map<string, number>()
  private counts = new Map<string, number>()
  private heroIndex = 0
  private deckId: string | null = null
  private deckName: string | null = null
  private message = ''
  private busy = false
  private poolSelected = 0
  private deckSelected = 0

  constructor(deps: DeckBuilderDeps) {
    this.deps = deps
  }

  back(): void {
    this.deps.onBack()
  }

  load(): Promise<void> {
    return this.run(async () => {
      const cards = fieldOf(await this.deps.api.get('/api/collection'), 'cards')
      this.owned = new Map()
      if (Array.isArray(cards)) {
        for (const entry of cards as unknown[]) {
          const id = textOf(entry, 'id')
          const copies = fieldOf(entry, 'copies')
          if (id !== null && typeof copies === 'number') this.owned.set(id, copies)
        }
      }
      const decks = await this.deps.api.get('/api/decks')
      const activeId = textOf(decks, 'active')
      const saved = (fieldOf(decks, 'decks') as unknown[] | undefined)?.find((deck) => textOf(deck, 'id') === activeId)
      if (saved === undefined) return
      const heroIndex = this.deps.heroes.findIndex((hero) => hero.id === textOf(saved, 'heroId'))
      this.heroIndex = Math.max(0, heroIndex)
      this.deckId = textOf(saved, 'id')
      this.deckName = textOf(saved, 'name')
      this.counts = new Map()
      const ids = fieldOf(saved, 'cards')
      if (Array.isArray(ids)) {
        for (const id of ids as unknown[]) {
          if (typeof id === 'string' && this.deps.registry.has(id)) this.counts.set(id, (this.counts.get(id) ?? 0) + 1)
        }
      }
    })
  }

  build(): UiNode {
    const hero = this.hero()
    const problems = this.problems()
    const pool = this.pool()
    const deck = this.deckCards()
    const poolItems: ListItem[] = pool.map((card) => {
      const inDeck = this.counts.get(card.id) ?? 0
      const usable = Math.min(capOf(card), this.owned.get(card.id) ?? 0)
      return { left: `${card.cost} ${card.name.en}`, right: `${inDeck}/${usable}  ${card.rarity}`, tone: inDeck > 0 ? 'accent' : 'normal' }
    })
    const deckItems: ListItem[] = deck.map(({ card, count }) => ({ left: `${card.cost} ${card.name.en}`, right: `x${count}` }))
    const idle = !this.busy
    return column([
      label('DECK BUILDER', { tone: 'accent', size: 24 }),
      label(hero === undefined ? 'No hero available' : `${hero.name.en}, ${hero.title.en}     Cards: ${this.total()}/${GAME_LIMITS.deckSize}`),
      label(problems.length === 0 ? 'The deck is legal.' : `Not yet legal: ${problems.join('; ')}`, { tone: problems.length === 0 ? 'accent' : 'warn', size: 14 }),
      row(
        [
          column([
            label('Collection (Enter adds a copy)', { tone: 'dim', size: 13 }),
            list('pool', poolItems, this.poolSelected, { onSelect: (index) => this.selectPool(index), onActivate: (index) => this.add(index) })
          ], { gap: 6 }),
          column([
            label('Deck (Enter removes a copy)', { tone: 'dim', size: 13 }),
            list('deck', deckItems, this.deckSelected, { onSelect: (index) => this.selectDeck(index), onActivate: (index) => this.remove(index) })
          ], { gap: 6 })
        ],
        { gap: 16, flex: 1 }
      ),
      row(
        [
          button('hero', 'Change hero', () => this.cycleHero(), idle && this.deps.heroes.length > 1),
          button('save', 'Save and use', () => void this.save(), idle && problems.length === 0),
          button('clear', 'Clear deck', () => this.clear(), idle),
          button('back', 'Back', () => this.back(), idle)
        ],
        { gap: 8 }
      ),
      label(this.message, { tone: 'dim', size: 14 })
    ], { padding: 24, gap: 10 })
  }

  async save(): Promise<void> {
    const hero = this.hero()
    if (hero === undefined || this.problems().length > 0) return
    await this.run(async () => {
      const body = {
        ...(this.deckId === null ? {} : { id: this.deckId }),
        name: this.deckName ?? `${hero.name.en}'s deck`,
        hero: hero.id,
        cards: this.expanded()
      }
      const deck = fieldOf(await this.deps.api.post('/api/decks', body), 'deck')
      const id = textOf(deck, 'id')
      if (id === null) {
        this.message = 'The server refused this deck.'
        return
      }
      this.deckId = id
      this.deckName = textOf(deck, 'name') ?? this.deckName
      const active = await this.deps.api.post(`/api/decks/active?id=${encodeURIComponent(id)}`)
      this.message = active === null ? 'Saved, but it could not be set as your active deck.' : 'Saved and set as your active deck.'
    })
  }

  private hero(): HeroDefinition | undefined {
    return this.deps.heroes[this.heroIndex]
  }

  private allowed(card: CardDefinition): boolean {
    const hero = this.hero()
    return hero !== undefined && (card.faction === 'neutral' || card.faction === hero.faction)
  }

  private pool(): CardDefinition[] {
    return [...this.deps.registry.values()].filter((card) => this.allowed(card) && (this.owned.get(card.id) ?? 0) > 0).sort(byCostThenName)
  }

  private deckCards(): { card: CardDefinition, count: number }[] {
    const entries: { card: CardDefinition, count: number }[] = []
    for (const [id, count] of this.counts) {
      const card = this.deps.registry.get(id)
      if (card !== undefined) entries.push({ card, count })
    }
    return entries.sort((a, b) => byCostThenName(a.card, b.card))
  }

  private total(): number {
    let total = 0
    for (const count of this.counts.values()) total += count
    return total
  }

  private expanded(): string[] {
    return this.deckCards().flatMap(({ card, count }) => Array.from({ length: count }, () => card.id))
  }

  private problems(): string[] {
    const hero = this.hero()
    if (hero === undefined) return ['no hero']
    const ids = this.expanded().map((id) => parseId('card', id))
    return validateDeck(ids, hero.faction, this.deps.registry).map((issue) => describeIssue(issue, ids.length))
  }

  private selectPool(index: number): void {
    this.poolSelected = index
    this.deps.onChange()
  }

  private selectDeck(index: number): void {
    this.deckSelected = index
    this.deps.onChange()
  }

  private add(index: number): void {
    const card = this.pool()[index]
    if (card === undefined) return
    const have = this.counts.get(card.id) ?? 0
    const owned = this.owned.get(card.id) ?? 0
    if (this.total() >= GAME_LIMITS.deckSize) this.message = `The deck already has ${GAME_LIMITS.deckSize} cards.`
    else if (have >= capOf(card)) this.message = `Only ${capOf(card)} ${capOf(card) === 1 ? 'copy' : 'copies'} of ${card.name.en} fit in a deck.`
    else if (have >= owned) this.message = `You only own ${owned} of ${card.name.en}.`
    else {
      this.counts.set(card.id, have + 1)
      this.message = ''
    }
    this.deps.onChange()
  }

  private remove(index: number): void {
    const entry = this.deckCards()[index]
    if (entry === undefined) return
    if (entry.count <= 1) this.counts.delete(entry.card.id)
    else this.counts.set(entry.card.id, entry.count - 1)
    this.deckSelected = Math.max(0, Math.min(this.deckSelected, this.deckCards().length - 1))
    this.message = ''
    this.deps.onChange()
  }

  private clear(): void {
    this.counts = new Map()
    this.deckSelected = 0
    this.message = 'The deck is empty.'
    this.deps.onChange()
  }

  private cycleHero(): void {
    if (this.deps.heroes.length < 2) return
    this.heroIndex = (this.heroIndex + 1) % this.deps.heroes.length
    for (const id of [...this.counts.keys()]) {
      const card = this.deps.registry.get(id)
      if (card === undefined || !this.allowed(card)) this.counts.delete(id)
    }
    this.deckId = null
    this.deckName = null
    this.poolSelected = 0
    this.deckSelected = 0
    this.message = 'Switched hero: cards the new hero cannot use were removed.'
    this.deps.onChange()
  }

  private async run(task: () => Promise<void>): Promise<void> {
    this.busy = true
    this.deps.onChange()
    try {
      await task()
    } finally {
      this.busy = false
      this.deps.onChange()
    }
  }
}