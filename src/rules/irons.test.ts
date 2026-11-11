import { describe, expect, test } from 'bun:test'
import { createRegistry } from '../shared/cards'
import { DomainError } from '../shared/errors'
import type { KeywordId } from '../shared/lexicon'
import { applyCommand, createMatch } from './engine'
import { cid, fixtureSetup, makeCard, stats } from './test-fixtures'
import type { Command, MatchState, Minion, PlayerIndex } from './types'

const iron = { family: 'iron', health: undefined } as const

const registry = createRegistry([
  makeCard(1, { ...iron, cost: 2, attack: 2, durability: 2 }),
  makeCard(2, { ...iron, cost: 1, attack: 3, durability: 1 }),
  makeCard(3)
])

const fresh = (): MatchState => {
  const state = createMatch(fixtureSetup(1)).state
  state.players[0].aether = 10
  return state
}

const step = (state: MatchState, actor: PlayerIndex, command: Command) => applyCommand(state, actor, command, registry)

const codeOf = (fn: () => unknown): string | null => {
  try {
    fn()
    return null
  } catch (error) {
    return error instanceof DomainError ? error.code : 'non-domain-error'
  }
}

const mk = (uid: number, n: number, keywords: KeywordId[] = []): Minion => {
  const { attack, health } = stats(n)
  return { uid, cardId: cid(n), attack, health, maxHealth: health, exhausted: false, keywords, onDeath: [] }
}

const hitHero: Command = { type: 'hero_attack', target: { kind: 'hero' } }

describe('irons', () => {
  test('equipping spends Aether, sets the weapon and replaces an older one', () => {
    const state = fresh()
    state.players[0].hand = [cid(1), cid(2)]
    const first = step(state, 0, { type: 'equip', handIndex: 0 })
    expect(first.state.players[0].weapon).toEqual({ cardId: cid(1), attack: 2, durability: 2 })
    expect(first.state.players[0].aether).toBe(8)
    expect(first.events).toEqual([{ type: 'iron_equipped', player: 0, cardId: cid(1), attack: 2, durability: 2 }])
    const second = step(first.state, 0, { type: 'equip', handIndex: 0 })
    expect(second.state.players[0].weapon).toEqual({ cardId: cid(2), attack: 3, durability: 1 })
  })

  test('the hero attacks once per turn, then again next turn until the iron breaks', () => {
    const state = fresh()
    state.players[0].weapon = { cardId: cid(1), attack: 2, durability: 2 }
    const first = step(state, 0, hitHero).state
    expect(first.players[1].heroHealth).toBe(28)
    expect(first.players[0].weapon?.durability).toBe(1)
    expect(codeOf(() => step(first, 0, hitHero))).toBe('invalid_command')

    const later = step(step(first, 0, { type: 'end_turn' }).state, 1, { type: 'end_turn' }).state
    const { state: second, events } = step(later, 0, hitHero)
    expect(second.players[1].heroHealth).toBe(26)
    expect(second.players[0].weapon).toBeNull()
    expect(events.some((event) => event.type === 'iron_broken')).toBe(true)
  })

  test('attacking a minion hurts the hero in return', () => {
    const state = fresh()
    state.players[0].weapon = { cardId: cid(1), attack: 2, durability: 2 }
    state.players[1].board = [mk(5, 3)]
    const next = step(state, 0, { type: 'hero_attack', target: { kind: 'minion', uid: 5 } }).state
    expect(next.players[1].board[0]?.health).toBe(1)
    expect(next.players[0].heroHealth).toBe(27)
  })

  test('a shield-wall blocks the hero as well', () => {
    const state = fresh()
    state.players[0].weapon = { cardId: cid(1), attack: 2, durability: 2 }
    state.players[1].board = [mk(5, 3, ['shield-wall'])]
    expect(codeOf(() => step(state, 0, hitHero))).toBe('illegal_target')
  })

  test('attacking without an iron is rejected', () => {
    expect(codeOf(() => step(fresh(), 0, hitHero))).toBe('invalid_command')
  })

  test('misuse and malformed irons are rejected', () => {
    const state = fresh()
    state.players[0].hand = [cid(3)]
    expect(codeOf(() => step(state, 0, { type: 'equip', handIndex: 0 }))).toBe('invalid_command')
    expect(() => createRegistry([makeCard(1, { ...iron, attack: 2 })])).toThrow(DomainError)
    expect(() => createRegistry([makeCard(1, { ...iron, attack: 0, durability: 2 })])).toThrow(DomainError)
  })
})