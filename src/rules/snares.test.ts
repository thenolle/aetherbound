import { describe, expect, test } from 'bun:test'
import { createRegistry } from '../shared/cards'
import { DomainError } from '../shared/errors'
import { applyCommand, createMatch } from './engine'
import { projectEvent, projectState } from './projection'
import { cid, fixtureSetup, makeCard } from './test-fixtures'
import type { Command, MatchState, PlayerIndex } from './types'

const snare = { family: 'snare', attack: undefined, health: undefined } as const
const writ = { family: 'writ', attack: undefined, health: undefined } as const

const registry = createRegistry([
  makeCard(1, { ...snare, cost: 2, trigger: 'enemy-play', effects: [{ kind: 'damage', amount: 2, target: 'enemy-hero' }] }),
  makeCard(2, { ...snare, cost: 1, trigger: 'enemy-cast', effects: [{ kind: 'damage', amount: 1, target: 'enemy-hero' }] }),
  makeCard(3),
  makeCard(4, { ...writ, cost: 1, effects: [{ kind: 'damage', amount: 1, target: 'enemy-hero' }] }),
  makeCard(5, { ...snare, cost: 1, trigger: 'enemy-attack', effects: [{ kind: 'damage', amount: 1, target: 'enemy-hero' }] })
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

describe('snares', () => {
  test('setting spends Aether and the card stays hidden from the opponent', () => {
    const state = fresh()
    state.players[0].hand = [cid(1)]
    const { state: next, events } = step(state, 0, { type: 'set', handIndex: 0 })
    expect(next.players[0].snares).toEqual([{ uid: 1, cardId: cid(1) }])
    expect(next.players[0].aether).toBe(8)
    expect(events[0]).toEqual({ type: 'snare_set', player: 0, uid: 1, cardId: cid(1) })
    expect(projectEvent(events[0] ?? { type: 'game_over', winner: 0 }, 1)).toEqual({ type: 'snare_set', player: 0, uid: 1, cardId: null })
  })

  test('the number of snare slots is limited', () => {
    const state = fresh()
    state.players[0].snares = [1, 2, 3].map((uid) => ({ uid, cardId: cid(1) }))
    state.players[0].hand = [cid(1)]
    expect(codeOf(() => step(state, 0, { type: 'set', handIndex: 0 }))).toBe('board_full')
  })

  test('an enemy-play snare springs after the opponent plays a bound', () => {
    const state = fresh()
    state.players[1].snares = [{ uid: 9, cardId: cid(1) }]
    state.players[0].hand = [cid(3)]
    const { state: next, events } = step(state, 0, { type: 'play', handIndex: 0, position: 0 })
    expect(next.players[0].heroHealth).toBe(28)
    expect(next.players[1].snares).toHaveLength(0)
    expect(events).toContainEqual({ type: 'snare_sprung', player: 1, uid: 9, cardId: cid(1) })
  })

  test('only the matching trigger springs a snare', () => {
    const state = fresh()
    state.players[1].snares = [{ uid: 9, cardId: cid(2) }]
    state.players[0].hand = [cid(3), cid(4)]
    const played = step(state, 0, { type: 'play', handIndex: 0, position: 0 }).state
    expect(played.players[0].heroHealth).toBe(30)
    expect(played.players[1].snares).toHaveLength(1)

    const cast = step(played, 0, { type: 'cast', handIndex: 0 }).state
    expect(cast.players[1].heroHealth).toBe(29)
    expect(cast.players[0].heroHealth).toBe(29)
    expect(cast.players[1].snares).toHaveLength(0)
  })

  test('your own snares never spring on your own actions', () => {
    const state = fresh()
    state.players[0].snares = [{ uid: 9, cardId: cid(1) }]
    state.players[0].hand = [cid(3)]
    const next = step(state, 0, { type: 'play', handIndex: 0, position: 0 }).state
    expect(next.players[0].snares).toHaveLength(1)
    expect(next.players[1].heroHealth).toBe(30)
  })

  test('only one snare springs per action, oldest first', () => {
    const state = fresh()
    state.players[1].snares = [{ uid: 9, cardId: cid(1) }, { uid: 10, cardId: cid(1) }]
    state.players[0].hand = [cid(3)]
    const next = step(state, 0, { type: 'play', handIndex: 0, position: 0 }).state
    expect(next.players[1].snares.map((entry) => entry.uid)).toEqual([10])
  })

  test('a hero attack springs an enemy-attack snare', () => {
    const state = fresh()
    state.players[0].weapon = { cardId: cid(3), attack: 2, durability: 2 }
    state.players[1].snares = [{ uid: 9, cardId: cid(5) }]
    const next = step(state, 0, { type: 'hero_attack', target: { kind: 'hero' } }).state
    expect(next.players[0].heroHealth).toBe(29)
    expect(next.players[1].snares).toHaveLength(0)
  })

  test('views hide snares from the opponent and the registry rejects bad snares', () => {
    const state = fresh()
    state.players[0].snares = [{ uid: 9, cardId: cid(1) }]
    const foeView = projectState(state, 1)
    expect(foeView.opponent.snareCount).toBe(1)
    expect(JSON.stringify(foeView.opponent)).not.toContain('"snares"')
    expect(JSON.stringify(foeView.opponent)).not.toContain(cid(1))
    expect(projectState(state, 0).self.snares).toEqual([{ uid: 9, cardId: cid(1) }])

    expect(() => createRegistry([makeCard(1, { ...snare, effects: [{ kind: 'draw', count: 1 }] })])).toThrow(DomainError)
    expect(() => createRegistry([makeCard(1, { ...snare, trigger: 'enemy-play', effects: [{ kind: 'damage', amount: 1, target: 'chosen-enemy-minion' }] })])).toThrow(DomainError)
  })
})