import { describe, expect, test } from 'bun:test'
import { cid, fixtureHero, fixtureRegistry, makeCard } from '../rules/test-fixtures'
import { createRegistry } from '../shared/cards'
import { parseId } from '../shared/ids'
import { findButton, findInput, findList, textsOf } from '../ui/nodes'
import { DeckBuilder } from './decks'
import type { Api } from './menu'

function fake(responses: Record<string, unknown>) {
  const posts: { path: string, body: unknown }[] = []
  const api: Api = {
    get: async (path) => responses[`GET ${path}`] ?? null,
    post: async (path, body) => {
      posts.push({ path, body })
      return responses[`POST ${path}`] ?? null
    }
  }
  return { api, posts }
}

const cartelHero = { ...fixtureHero, id: parseId('hero', 'cartel-hero'), faction: 'brine-lock' as const }

const mixed = createRegistry([
  makeCard(1, { cost: 1 }),
  makeCard(2, { cost: 2 }),
  makeCard(3, { cost: 3, unique: true }),
  makeCard(4, { faction: 'exchequer', cost: 4 }),
  makeCard(5, { faction: 'brine-lock', cost: 5 })
])

const ownedMixed = {
  cards: [
    { id: cid(1), copies: 2 },
    { id: cid(2), copies: 1 },
    { id: cid(3), copies: 1 },
    { id: cid(4), copies: 2 },
    { id: cid(5), copies: 2 }
  ]
}

function builder(registry = mixed, responses: Record<string, unknown> = {}, heroes = [fixtureHero, cartelHero]) {
  const { api, posts } = fake({ 'GET /api/collection': ownedMixed, 'GET /api/decks': { decks: [], active: null }, ...responses })
  const instance = new DeckBuilder({ api, registry, heroes, onChange: () => undefined, onBack: () => undefined })
  return { instance, posts }
}

describe('DeckBuilder', () => {
  test('loads the collection and the active deck, offering only usable cards', async () => {
    const { instance } = builder(mixed, {'GET /api/decks': { decks: [{ id: 'deck-1', name: 'Taxes', heroId: fixtureHero.id, cards: [cid(1), cid(1)] }], active: 'deck-1' }})
    await instance.load()
    const tree = instance.build()
    expect(findList(tree, 'pool')?.items.map((item) => item.left)).toEqual(['1 Test Card 1', '2 Test Card 2', '3 Test Card 3', '4 Test Card 4'])
    expect(findList(tree, 'deck')?.items).toEqual([{ left: '1 Test Card 1', right: 'x2' }])
    expect(textsOf(tree).some((text) => text.includes('Cards: 2/30'))).toBe(true)
  })

  test('adding respects the copy cap, the unique cap and what you own', async () => {
    const { instance } = builder()
    await instance.load()
    const add = (index: number) => findList(instance.build(), 'pool')?.onActivate(index)
    const message = () => textsOf(instance.build()).at(-1)
    add(0)
    add(0)
    add(0)
    expect(message()).toBe('Only 2 copies of Test Card 1 fit in a deck.')
    add(1)
    add(1)
    expect(message()).toBe('You only own 1 of Test Card 2.')
    add(2)
    add(2)
    expect(message()).toBe('Only 1 copy of Test Card 3 fit in a deck.')
    expect(findList(instance.build(), 'deck')?.items.map((item) => item.right)).toEqual(['x2', 'x1', 'x1'])
  })

  test('removing and clearing work and an incomplete deck cannot be saved', async () => {
    const { instance } = builder()
    await instance.load()
    findList(instance.build(), 'pool')?.onActivate(0)
    findList(instance.build(), 'pool')?.onActivate(0)
    findList(instance.build(), 'deck')?.onActivate(0)
    expect(findList(instance.build(), 'deck')?.items).toEqual([{ left: '1 Test Card 1', right: 'x1' }])
    expect(textsOf(instance.build()).some((text) => text.includes('needs 30 cards, has 1'))).toBe(true)
    expect(findButton(instance.build(), 'save')?.enabled).toBe(false)
    findButton(instance.build(), 'clear')?.onPress()
    expect(findList(instance.build(), 'deck')?.items).toEqual([])
  })

  test('a legal deck is saved and then set as the active deck', async () => {
    const { instance, posts } = builder(fixtureRegistry, {
      'GET /api/collection': { cards: Array.from({ length: 15 }, (_, index) => ({ id: cid(index + 1), copies: 2 })) },
      'POST /api/decks': { deck: { id: 'deck-new', name: "Test Hero's deck" } },
      'POST /api/decks/active?id=deck-new': {}
    }, [fixtureHero])
    await instance.load()
    for (let pass = 0; pass < 2; pass += 1) {
      for (let index = 0; index < 15; index += 1) findList(instance.build(), 'pool')?.onActivate(index)
    }
    expect(textsOf(instance.build())).toContain('The deck is legal.')
    const save = findButton(instance.build(), 'save')
    expect(save?.enabled).toBe(true)
    save?.onPress()
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(posts.map((post) => post.path)).toEqual(['/api/decks', '/api/decks/active?id=deck-new'])
    const sent = posts[0]?.body as { name: string, hero: string, cards: string[] }
    expect(sent).toMatchObject({ name: "Test Hero's deck", hero: fixtureHero.id })
    expect(sent.cards).toHaveLength(30)
    expect(textsOf(instance.build()).at(-1)).toBe('Saved and set as your active deck.')
  })

  test('changing hero drops cards the new hero cannot use and starts a new deck', async () => {
    const { instance } = builder()
    await instance.load()
    findList(instance.build(), 'pool')?.onActivate(0)
    findList(instance.build(), 'pool')?.onActivate(3)
    expect(findList(instance.build(), 'deck')?.items).toHaveLength(2)
    findButton(instance.build(), 'hero')?.onPress()
    expect(findList(instance.build(), 'deck')?.items.map((item) => item.left)).toEqual(['1 Test Card 1'])
    expect(findList(instance.build(), 'pool')?.items.map((item) => item.left)).toContain('5 Test Card 5')
    expect(findList(instance.build(), 'pool')?.items.map((item) => item.left)).not.toContain('4 Test Card 4')
  })

  test('a typed deck name is what gets saved', async () => {
    const { instance, posts } = builder(fixtureRegistry, {
      'GET /api/collection': { cards: Array.from({ length: 15 }, (_, index) => ({ id: cid(index + 1), copies: 2 })) },
      'POST /api/decks': { deck: { id: 'deck-new', name: 'Tax Season' } },
      'POST /api/decks/active?id=deck-new': {}
    }, [fixtureHero])
    await instance.load()
    for (let pass = 0; pass < 2; pass += 1) {
      for (let index = 0; index < 15; index += 1) findList(instance.build(), 'pool')?.onActivate(index)
    }
    findInput(instance.build(), 'deck-name')?.onChange('  Tax Season ')
    findButton(instance.build(), 'save')?.onPress()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((posts[0]?.body as { name: string }).name).toBe('Tax Season')
  })
})