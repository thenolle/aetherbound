import { describe, expect, test } from 'bun:test'
import { findButton, textsOf } from '../ui/nodes'
import { MenuController } from './menu'
import type { Api, MenuActions } from './menu'

function fake(responses: Record<string, unknown>) {
  const calls: string[] = []
  const api: Api = {
    get: async (path) => {
      calls.push(`GET ${path}`)
      return responses[`GET ${path}`] ?? null
    },
    post: async (path) => {
      calls.push(`POST ${path}`)
      return responses[`POST ${path}`] ?? null
    }
  }
  return { api, calls }
}

const noActions: MenuActions = { play: () => undefined, signOut: () => undefined, openDecks: () => undefined }

describe('MenuController', () => {
  test('loads the balances and only offers to open a pack when one is available', async () => {
    const { api } = fake({ 'GET /api/collection': { cards: [], packs: 0, dust: 15 } })
    const menu = new MenuController(api, 'Mireille', noActions, () => undefined)
    await menu.refresh()
    expect(textsOf(menu.build())).toContain('Packs: 0    Dust: 15')
    expect(findButton(menu.build(), 'open')?.enabled).toBe(false)

    const withPack = fake({ 'GET /api/collection': { cards: [], packs: 2, dust: 0 } })
    const richer = new MenuController(withPack.api, 'Mireille', noActions, () => undefined)
    await richer.refresh()
    expect(findButton(richer.build(), 'open')?.enabled).toBe(true)
  })

  test('claiming the daily pack reports the outcome and updates the balance', async () => {
    const { api } = fake({ 'POST /api/packs/daily': { claimed: true, packs: 1, dust: 0 } })
    const menu = new MenuController(api, 'M', noActions, () => undefined)
    await menu.claimDaily()
    expect(textsOf(menu.build())).toContain('Daily pack claimed.')
    expect(textsOf(menu.build())).toContain('Packs: 1    Dust: 0')

    const again = fake({ 'POST /api/packs/daily': { claimed: false, packs: 1, dust: 0 } })
    const second = new MenuController(again.api, 'M', noActions, () => undefined)
    await second.claimDaily()
    expect(textsOf(second.build())).toContain("Today's pack was already claimed.")
  })

  test('opening a pack lists the cards, flags duplicates and shows the dust gained', async () => {
    const { api, calls } = fake({
      'POST /api/packs/open': {
        cards: [
          { id: 'tally-clerk', name: { en: 'Tally-Clerk', fr: 'Pointeur de Comptes' }, rarity: 'common', duplicate: false },
          { id: 'toll-bridge', name: { en: 'Toll-Bridge', fr: 'Pont a Peage' }, rarity: 'rare', duplicate: true }
        ],
        dustGained: 20,
        packs: 0,
        dust: 20
      }
    })
    const menu = new MenuController(api, 'M', noActions, () => undefined)
    await menu.openPack()
    const texts = textsOf(menu.build())
    expect(texts).toContain('Tally-Clerk (common) - new')
    expect(texts).toContain('Toll-Bridge (rare) - duplicate')
    expect(texts).toContain('Dust gained: 20')
    expect(texts).toContain('Packs: 0    Dust: 20')
    expect(calls).toEqual(['POST /api/packs/open'])
  })

  test('a failed request explains itself and the menu becomes usable again', async () => {
    const { api } = fake({})
    const menu = new MenuController(api, 'M', noActions, () => undefined)
    await menu.openPack()
    await menu.claimDaily()
    expect(textsOf(menu.build())).toContain('The daily pack could not be claimed.')
    expect(findButton(menu.build(), 'daily')?.enabled).toBe(true)
  })

  test('buttons call the actions and are disabled while a request is running', async () => {
    const played: string[] = []
    let release: () => void = () => undefined
    const api: Api = {
      get: () => new Promise((resolve) => { release = () => resolve({ packs: 0, dust: 0 }) }),
      post: async () => null
    }
    const actions: MenuActions = { play: (mode) => played.push(mode), signOut: () => played.push('out'), openDecks: () => undefined }
    const menu = new MenuController(api, 'M', actions, () => undefined)
    findButton(menu.build(), 'play-ranked')?.onPress()
    findButton(menu.build(), 'sign-out')?.onPress()
    expect(played).toEqual(['ranked', 'out'])

    const pending = menu.refresh()
    expect(findButton(menu.build(), 'play-casual')?.enabled).toBe(false)
    release()
    await pending
    expect(findButton(menu.build(), 'play-casual')?.enabled).toBe(true)
  })
})