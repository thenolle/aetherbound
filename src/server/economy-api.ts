import { PACK_TABLE, rollPack } from '../content/packs'
import type { EconomyStore } from '../persistence/economy-store'
import type { Account } from '../persistence/account-store'
import type { ContentLookup } from '../persistence/restore'
import { DomainError } from '../shared/errors'
import { GAME_LIMITS } from '../shared/lexicon'
import { Rng } from '../shared/rng'
import type { DeckService } from './decks'
import { empty, json } from './origin'
import { CRAFT_COST } from '../content/economy'

export type EconomyServices = Readonly<{
  economy: EconomyStore
  decks: DeckService
  content: ContentLookup
  now: () => number
}>

const MAX_BODY_BYTES = 8192

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) throw new DomainError('invalid_command', 'request body is too large')
  try {
    return JSON.parse(text)
  } catch {
    throw new DomainError('invalid_command', 'request body is not valid json')
  }
}

export async function handleEconomy(request: Request, url: URL, account: Account, services: EconomyServices): Promise<Response | null> {
  const { economy, decks, content } = services
  const route = `${request.method} ${url.pathname}`
  const pool = [...content.registry.values()]

  try {
    switch (route) {
      case 'GET /api/collection': {
        decks.ensureStarter(account.id)
        const cards = [...economy.collection(account.id)].map(([id, copies]) => ({ id, copies })).sort((a, b) => a.id.localeCompare(b.id))
        return json({ cards, ...economy.balances(account.id) }, 200)
      }
      case 'GET /api/decks': {
        decks.ensureStarter(account.id)
        return json({ decks: economy.listDecks(account.id), active: economy.activeDeck(account.id)?.id ?? null }, 200)
      }
      case 'POST /api/decks':
        return json({ deck: decks.save(account.id, (await readBody(request)) as Record<string, unknown>) }, 200)
      case 'POST /api/decks/delete':
        return economy.deleteDeck(account.id, url.searchParams.get('id') ?? '') ? empty(204) : json({ error: 'not_found' }, 404)
      case 'POST /api/decks/active':
        return economy.setActiveDeck(account.id, url.searchParams.get('id') ?? '') ? empty(204) : json({ error: 'not_found' }, 404)
      case 'POST /api/craft': {
        decks.ensureStarter(account.id)
        const card = content.registry.get(url.searchParams.get('card') ?? '')
        if (card === undefined) return json({ error: 'not_found' }, 404)
        const cap = card.unique ? GAME_LIMITS.maxUniqueCopies : GAME_LIMITS.maxCopies
        const crafted = economy.craft(account.id, card.id, CRAFT_COST[card.rarity], cap)
        if (!crafted.ok) return json({ error: crafted.reason }, 409)
        return json({ card: card.id, copies: crafted.copies, dust: crafted.dust }, 200)
      }
      case 'GET /api/packs/odds':
        return json(PACK_TABLE, 200)
      case 'POST /api/packs/daily': {
        const day = new Date(services.now()).toISOString().slice(0, 10)
        const claimed = economy.claimDaily(account.id, day)
        return json({ claimed, ...economy.balances(account.id) }, 200)
      }
      case 'POST /api/packs/open': {
        const result = economy.openPack(account.id, {
          tableVersion: PACK_TABLE.version,
          roll: (seed) => rollPack(new Rng(seed), pool),
          limits: (cardId) => {
            const card = content.registry.get(cardId)
            if (card === undefined) throw new DomainError('internal', 'pack rolled an unknown card')
            return { cap: card.unique ? GAME_LIMITS.maxUniqueCopies : GAME_LIMITS.maxCopies, dust: PACK_TABLE.dust[card.rarity] }
          }
        })
        if (result === null) return json({ error: 'no_packs' }, 409)
        const cards = result.cards.map((entry) => {
          const card = content.registry.get(entry.id)
          return { id: entry.id, name: card?.name, rarity: card?.rarity, duplicate: entry.duplicate }
        })
        return json({ cards, dustGained: result.dustGained, ...result.balances }, 200)
      }
      default:
        return null
    }
  } catch (error) {
    if (error instanceof DomainError) return json({ error: error.code, message: error.code === 'internal' ? 'internal error' : error.message }, error.code === 'internal' ? 500 : 400)
    throw error
  }
}