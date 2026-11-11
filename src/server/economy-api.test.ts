import { beforeEach, describe, expect, test } from 'bun:test'
import { SqliteAccountStore } from '../persistence/account-store'
import type { Account } from '../persistence/account-store'
import { migrate, openDatabase } from '../persistence/database'
import { EconomyStore } from '../persistence/economy-store'
import { MIGRATIONS } from '../persistence/migrations'
import { fixtureDeck, fixtureHero, fixtureRegistry } from '../rules/test-fixtures'
import { DeckService } from './decks'
import { handleEconomy } from './economy-api'
import type { EconomyServices } from './economy-api'

let services: EconomyServices
let account: Account

beforeEach(() => {
  const db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  const accounts = new SqliteAccountStore(db, () => 1000)
  account = accounts.upsertGoogleAccount('alice', 'Alice')
  const content = { registry: fixtureRegistry, heroes: new Map([[fixtureHero.id, fixtureHero]]) }
  const economy = new EconomyStore(db, () => 1000)
  services = {
    economy,
    decks: new DeckService(economy, content, { hero: fixtureHero, deck: fixtureDeck }),
    content,
    now: () => Date.UTC(2026, 10, 11, 12)
  }
})

const call = (method: string, path: string, body?: unknown) => handleEconomy(new Request(`http://localhost:8080${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }), new URL(`http://localhost:8080${path}`), account, services)
const read = async (response: Response | null): Promise<Record<string, unknown>> => (await (response ?? new Response('{}')).json()) as Record<string, unknown>

describe('economy api', () => {
  test('the collection starts with the starter cards and unknown routes fall through', async () => {
    const body = await read(await call('GET', '/api/collection'))
    expect(body.cards).toHaveLength(15)
    expect(body).toMatchObject({ packs: 0, dust: 0 })
    expect(await call('GET', '/api/unknown')).toBeNull()
  })

  test('decks can be saved, activated and deleted, and bad decks are refused', async () => {
    const saved = await read(await call('POST', '/api/decks', { name: 'Taxes', hero: fixtureHero.id, cards: fixtureDeck }))
    const id = (saved.deck as { id: string }).id
    expect((await call('POST', `/api/decks/active?id=${id}`))?.status).toBe(204)
    expect(await read(await call('GET', '/api/decks'))).toMatchObject({ active: id })
    const refused = await call('POST', '/api/decks', { name: 'Bad', hero: fixtureHero.id, cards: fixtureDeck.slice(1) })
    expect(refused?.status).toBe(400)
    expect(await read(refused)).toMatchObject({ error: 'deck_invalid' })
    expect((await call('POST', `/api/decks/delete?id=${id}`))?.status).toBe(204)
    expect((await call('POST', `/api/decks/delete?id=${id}`))?.status).toBe(404)
  })

  test('packs: a daily claim once per day, then opening spends it', async () => {
    expect((await call('POST', '/api/packs/open'))?.status).toBe(409)
    expect(await read(await call('POST', '/api/packs/daily'))).toMatchObject({ claimed: true, packs: 1 })
    expect(await read(await call('POST', '/api/packs/daily'))).toMatchObject({ claimed: false, packs: 1 })
    const opened = await read(await call('POST', '/api/packs/open'))
    expect(opened.cards).toHaveLength(5)
    expect(opened.packs).toBe(0)
    expect(await read(await call('GET', '/api/packs/odds'))).toMatchObject({ version: 1, size: 5 })
  })

  test('crafting refuses unknown cards and cards already at the copy limit', async () => {
    expect((await call('POST', '/api/craft?card=nope'))?.status).toBe(404)
    const atLimit = await call('POST', '/api/craft?card=test-01')
    expect(atLimit?.status).toBe(409)
    expect(await read(atLimit)).toMatchObject({ error: 'at_copy_limit' })
  })
})