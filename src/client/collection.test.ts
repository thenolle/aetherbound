import { describe, expect, test } from 'bun:test'
import { cid, makeCard } from '../rules/test-fixtures'
import { createRegistry } from '../shared/cards'
import { findButton, findList, textsOf } from '../ui/nodes'
import { CollectionScreen } from './collection'
import type { Api } from './menu'

const registry = createRegistry([
  makeCard(1, { rarity: 'common' }),
  makeCard(2, { rarity: 'rare' }),
  makeCard(3, { rarity: 'legendary', unique: true })
])

function screen(responses: Record<string, unknown>) {
  const posts: string[] = []
  const api: Api = {
    get: async (path) => responses[`GET ${path}`] ?? null,
    post: async (path) => {
      posts.push(path)
      return responses[`POST ${path}`] ?? null
    }
  }
  return { instance: new CollectionScreen({ api, registry, onChange: () => undefined, onBack: () => undefined }), posts }
}

const collection = { cards: [{ id: cid(1), copies: 2 }], dust: 150 }

describe('CollectionScreen', () => {
  test('lists every card, rarest first, with ownership and craft cost', async () => {
    const { instance } = screen({ 'GET /api/collection': collection })
    await instance.load()
    const cards = findList(instance.build(), 'cards')
    expect(cards?.items.map((item) => [item.left, item.right])).toEqual([
      ['Test Card 3  [legendary]', '0/1   1600 dust'],
      ['Test Card 2  [rare]', '0/2   100 dust'],
      ['Test Card 1  [common]', '2/2   40 dust']
    ])
    expect(cards?.items[2]?.tone).toBe('dim')
    expect(textsOf(instance.build()).some((text) => text.startsWith('Dust: 150'))).toBe(true)
  })

  test('crafting is refused locally without enough dust or beyond the copy limit', async () => {
    const { instance, posts } = screen({ 'GET /api/collection': collection })
    await instance.load()
    await instance.craft(0)
    expect(textsOf(instance.build()).at(-1)).toBe('Test Card 3 costs 1600 dust; you have 150.')
    await instance.craft(2)
    expect(textsOf(instance.build()).at(-1)).toBe('You already own every copy of Test Card 1.')
    expect(posts).toEqual([])
  })

  test('a successful craft updates copies and dust from the server answer', async () => {
    const { instance, posts } = screen({
      'GET /api/collection': collection,
      'POST /api/craft?card=test-02': { card: 'test-02', copies: 1, dust: 50 }
    })
    await instance.load()
    findList(instance.build(), 'cards')?.onActivate(1)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(posts).toEqual(['/api/craft?card=test-02'])
    expect(findList(instance.build(), 'cards')?.items[1]?.right).toBe('1/2   100 dust')
    expect(textsOf(instance.build()).some((text) => text.startsWith('Dust: 50'))).toBe(true)
    expect(textsOf(instance.build()).at(-1)).toBe('Crafted Test Card 2.')
  })

  test('a refused craft says so and keeps the balance', async () => {
    const { instance } = screen({ 'GET /api/collection': collection })
    await instance.load()
    await instance.craft(1)
    expect(textsOf(instance.build()).at(-1)).toBe('The server refused the craft.')
    expect(textsOf(instance.build()).some((text) => text.startsWith('Dust: 150'))).toBe(true)
    expect(findButton(instance.build(), 'craft')?.enabled).toBe(true)
  })
})