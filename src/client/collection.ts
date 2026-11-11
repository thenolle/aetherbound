import { CRAFT_COST } from '../content/economy'
import type { CardDefinition, CardRegistry } from '../shared/cards'
import { GAME_LIMITS, RARITY_IDS } from '../shared/lexicon'
import { button, column, label, list, row } from '../ui/nodes'
import type { ListItem, UiNode } from '../ui/nodes'
import { fieldOf, numberOf, textOf } from './json'
import type { Api } from './menu'

export type CollectionDeps = Readonly<{
  api: Api
  registry: CardRegistry
  onChange: () => void
  onBack: () => void
}>

const capOf = (card: CardDefinition): number => (card.unique ? GAME_LIMITS.maxUniqueCopies : GAME_LIMITS.maxCopies)

export class CollectionScreen {
  private readonly deps: CollectionDeps
  private owned = new Map<string, number>()
  private dust = 0
  private selected = 0
  private message = ''
  private busy = false

  constructor(deps: CollectionDeps) {
    this.deps = deps
  }

  back(): void {
    this.deps.onBack()
  }

  load(): Promise<void> {
    return this.run(async () => {
      const body = await this.deps.api.get('/api/collection')
      const cards = fieldOf(body, 'cards')
      this.owned = new Map()
      if (Array.isArray(cards)) {
        for (const entry of cards as unknown[]) {
          const id = textOf(entry, 'id')
          const copies = fieldOf(entry, 'copies')
          if (id !== null && typeof copies === 'number') this.owned.set(id, copies)
        }
      }
      this.dust = numberOf(body, 'dust') ?? this.dust
    })
  }

  craft(index: number): Promise<void> {
    const card = this.cards()[index]
    if (card === undefined) return Promise.resolve()
    const have = this.owned.get(card.id) ?? 0
    const cost = CRAFT_COST[card.rarity]
    if (have >= capOf(card)) {
      this.message = `You already own every copy of ${card.name.en}.`
      this.deps.onChange()
      return Promise.resolve()
    }
    if (this.dust < cost) {
      this.message = `${card.name.en} costs ${cost} dust; you have ${this.dust}.`
      this.deps.onChange()
      return Promise.resolve()
    }
    return this.run(async () => {
      const body = await this.deps.api.post(`/api/craft?card=${encodeURIComponent(card.id)}`)
      const copies = numberOf(body, 'copies')
      if (copies === null) {
        this.message = 'The server refused the craft.'
        return
      }
      this.owned.set(card.id, copies)
      this.dust = numberOf(body, 'dust') ?? this.dust - cost
      this.message = `Crafted ${card.name.en}.`
    })
  }

  build(): UiNode {
    const idle = !this.busy
    const items: ListItem[] = this.cards().map((card) => {
      const have = this.owned.get(card.id) ?? 0
      return {
        left: `${card.name.en}  [${card.rarity}]`,
        right: `${have}/${capOf(card)}   ${CRAFT_COST[card.rarity]} dust`,
        tone: have >= capOf(card) ? 'dim' : 'normal'
      }
    })
    return column([
      label('COLLECTION', { tone: 'accent', size: 24 }),
      label(`Dust: ${this.dust}     Crafting: common ${CRAFT_COST.common}, rare ${CRAFT_COST.rare}, epic ${CRAFT_COST.epic}, legendary ${CRAFT_COST.legendary}`, { tone: 'dim', size: 14 }),
      row(
        [
          list('cards', items, this.selected, {
            title: 'Cards',
            onSelect: (index) => {
              this.selected = index
              this.deps.onChange()
            },
            onActivate: (index) => void this.craft(index)
          })
        ],
        { flex: 1 }
      ),
      row(
        [
          button('craft', 'Craft selected', () => void this.craft(this.selected), idle),
          button('back', 'Back', () => this.back(), idle)
        ],
        { gap: 8 }
      ),
      label(this.message, { tone: 'dim', size: 14 })
    ], { padding: 24, gap: 10 })
  }

  private cards(): CardDefinition[] {
    return [...this.deps.registry.values()].filter((card) => card.token !== true).sort((a, b) => RARITY_IDS.indexOf(b.rarity) - RARITY_IDS.indexOf(a.rarity) || a.cost - b.cost || a.name.en.localeCompare(b.name.en))
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