import { button, column, label, spacer } from '../ui/nodes'
import type { UiNode } from '../ui/nodes'
import { fieldOf, numberOf, textOf } from './json'

export interface Api {
  get(path: string): Promise<unknown>
  post(path: string, body?: unknown): Promise<unknown>
}

export type MenuActions = Readonly<{
  play: (mode: 'casual' | 'ranked') => void
  openDecks: () => void
  signOut: () => void
  openCollection: () => void
}>

const MAX_LINES = 8

export class MenuController {
  private packs = 0
  private dust = 0
  private busy = false
  private lines: string[] = []
  private readonly api: Api
  private readonly playerName: string
  private readonly actions: MenuActions
  private readonly onChange: () => void

  constructor(api: Api, playerName: string, actions: MenuActions, onChange: () => void) {
    this.api = api
    this.playerName = playerName
    this.actions = actions
    this.onChange = onChange
  }

  refresh(): Promise<void> {
    return this.run(async () => {
      this.applyBalances(await this.api.get('/api/collection'))
    })
  }

  claimDaily(): Promise<void> {
    return this.run(async () => {
      const body = await this.api.post('/api/packs/daily')
      const claimed = fieldOf(body, 'claimed')
      if (claimed === true) this.say('Daily pack claimed.')
      else if (claimed === false) this.say("Today's pack was already claimed.")
      else this.say('The daily pack could not be claimed.')
      this.applyBalances(body)
    })
  }

  openPack(): Promise<void> {
    return this.run(async () => {
      const body = await this.api.post('/api/packs/open')
      const cards = fieldOf(body, 'cards')
      if (!Array.isArray(cards)) {
        this.say('No pack could be opened.')
        return
      }
      this.lines = cards.map((card: unknown) => {
        const name = textOf(fieldOf(card, 'name'), 'en') ?? textOf(card, 'id') ?? 'unknown card'
        return `${name} (${textOf(card, 'rarity') ?? '?'})${fieldOf(card, 'duplicate') === true ? ' - duplicate' : ' - new'}`
      })
      const gained = numberOf(body, 'dustGained') ?? 0
      if (gained > 0) this.lines.push(`Dust gained: ${gained}`)
      this.lines = this.lines.slice(0, MAX_LINES)
      this.applyBalances(body)
    })
  }

  build(): UiNode {
    const idle = !this.busy
    return column([
      label('AETHERBOUND: SHATTERED CONCORD', { tone: 'accent', size: 26 }),
      label(`Signed in as ${this.playerName}`, { tone: 'dim' }),
      label(`Packs: ${this.packs}    Dust: ${this.dust}`),
      button('play-casual', 'Play casual', () => this.actions.play('casual'), idle),
      button('play-ranked', 'Play ranked', () => this.actions.play('ranked'), idle),
      button('daily', 'Claim daily pack', () => void this.claimDaily(), idle),
      button('open', 'Open a pack', () => void this.openPack(), idle && this.packs > 0),
      button('decks', 'Build decks', () => this.actions.openDecks(), idle),
      button('collection', 'Collection and crafting', () => this.actions.openCollection(), idle),
      button('sign-out', 'Sign out', () => this.actions.signOut(), idle),
      spacer(),
      ...this.lines.map((line) => label(line)),
      label('Arrows or Tab move, Enter chooses, clicking works too.', { tone: 'dim', size: 13 })
    ], { padding: 28, gap: 12 })
  }

  private async run(task: () => Promise<void>): Promise<void> {
    this.busy = true
    this.onChange()
    try {
      await task()
    } finally {
      this.busy = false
      this.onChange()
    }
  }

  private say(text: string): void {
    this.lines = [text]
  }

  private applyBalances(body: unknown): void {
    this.packs = numberOf(body, 'packs') ?? this.packs
    this.dust = numberOf(body, 'dust') ?? this.dust
  }
}