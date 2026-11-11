import { describe, expect, test } from 'bun:test'
import { DomainError } from '../shared/errors'
import { applyCommand, createMatch } from './engine'
import { cid, fixtureDeck, fixtureHero, fixtureRegistry, fixtureSetup, stats } from './test-fixtures'
import type { Command, MatchState, Minion, PlayerIndex } from './types'

const fresh = (seed = 1): MatchState => createMatch(fixtureSetup(seed)).state

const step = (state: MatchState, actor: PlayerIndex, command: Command) =>
  applyCommand(state, actor, command, fixtureRegistry)

const codeOf = (fn: () => unknown): string | null => {
  try {
    fn()
    return null
  } catch (error) {
    return error instanceof DomainError ? error.code : 'non-domain-error'
  }
}

const minion = (uid: number, n: number, exhausted = false): Minion => {
  const { attack, health } = stats(n)
  return { uid, cardId: cid(n), attack, health, maxHealth: health, exhausted, keywords: [] }
}

const endTurn: Command = { type: 'end_turn' }

describe('createMatch', () => {
  test('deals opening hands and starts the first turn', () => {
    const { state, events } = createMatch(fixtureSetup(1))
    expect(state.turn).toBe(1)
    expect(state.active).toBe(0)
    expect(state.winner).toBeNull()
    expect(state.players[0].hand).toHaveLength(4)
    expect(state.players[0].deck).toHaveLength(26)
    expect(state.players[1].hand).toHaveLength(4)
    expect(state.players[1].deck).toHaveLength(26)
    expect(state.players[0].aether).toBe(1)
    expect(state.players[0].aetherMax).toBe(1)
    expect(state.players[0].heroHealth).toBe(30)
    expect(events.some((event) => event.type === 'turn_started')).toBe(true)
  })

  test('is deterministic for a seed', () => {
    expect(fresh(7)).toEqual(fresh(7))
    expect(fresh(7).players[0].deck).not.toEqual(fresh(8).players[0].deck)
  })

  test('rejects an illegal deck', () => {
    const setup = {
      ...fixtureSetup(1),
      players: [
        { hero: fixtureHero, deck: fixtureDeck.slice(1) },
        { hero: fixtureHero, deck: fixtureDeck }
      ] as const
    }
    expect(codeOf(() => createMatch(setup))).toBe('deck_invalid')
  })
})

describe('play', () => {
  test('places a minion and spends Aether', () => {
    const state = fresh()
    state.players[0].hand = [cid(2)]
    state.players[0].aether = 2
    const { state: next, events } = step(state, 0, { type: 'play', handIndex: 0, position: 0 })
    const side = next.players[0]
    expect(side.aether).toBe(0)
    expect(side.hand).toHaveLength(0)
    expect(side.board).toHaveLength(1)
    expect(side.board[0]).toMatchObject({ cardId: cid(2), attack: 2, health: 2, exhausted: true })
    expect(events).toEqual([{ type: 'minion_played', player: 0, uid: 1, cardId: cid(2), position: 0 }])
    expect(state.players[0].hand).toHaveLength(1)
  })

  test('rejects insufficient Aether', () => {
    const state = fresh()
    state.players[0].hand = [cid(3)]
    state.players[0].aether = 1
    expect(codeOf(() => step(state, 0, { type: 'play', handIndex: 0, position: 0 }))).toBe('insufficient_aether')
  })

  test('rejects play out of turn', () => {
    expect(codeOf(() => step(fresh(), 1, endTurn))).toBe('not_your_turn')
  })

  test('rejects a full board', () => {
    const state = fresh()
    state.players[0].board = [1, 2, 3, 4, 5, 6, 7].map((uid) => minion(uid, 1))
    state.players[0].hand = [cid(1)]
    state.players[0].aether = 1
    expect(codeOf(() => step(state, 0, { type: 'play', handIndex: 0, position: 0 }))).toBe('board_full')
  })

  test('rejects bad indexes', () => {
    const state = fresh()
    state.players[0].hand = [cid(1)]
    state.players[0].aether = 1
    expect(codeOf(() => step(state, 0, { type: 'play', handIndex: 3, position: 0 }))).toBe('invalid_command')
    expect(codeOf(() => step(state, 0, { type: 'play', handIndex: 0, position: 2 }))).toBe('invalid_command')
    expect(codeOf(() => step(state, 0, { type: 'play', handIndex: 0, position: 0.5 }))).toBe('invalid_command')
  })
})

describe('combat', () => {
  test('a freshly played minion cannot attack, then can next turn', () => {
    const state = fresh()
    state.players[0].hand = [cid(2)]
    state.players[0].aether = 2
    const played = step(state, 0, { type: 'play', handIndex: 0, position: 0 }).state
    const uid = played.players[0].board[0]?.uid ?? -1
    const attack: Command = { type: 'attack', attackerUid: uid, target: { kind: 'hero' } }
    expect(codeOf(() => step(played, 0, attack))).toBe('invalid_command')

    const later = step(step(played, 0, endTurn).state, 1, endTurn).state
    expect(later.players[0].board[0]?.exhausted).toBe(false)
    const hit = step(later, 0, attack).state
    expect(hit.players[1].heroHealth).toBe(28)
  })

  test('minion trade leaves the survivor damaged', () => {
    const state = fresh()
    state.players[0].board = [minion(1, 3)]
    state.players[1].board = [minion(2, 2)]
    const { state: next, events } = step(state, 0, { type: 'attack', attackerUid: 1, target: { kind: 'minion', uid: 2 } })
    expect(next.players[1].board).toHaveLength(0)
    expect(next.players[0].board[0]?.health).toBe(1)
    expect(events.filter((event) => event.type === 'minion_died')).toEqual([{ type: 'minion_died', player: 1, uid: 2 }])
  })

  test('both minions can die at once', () => {
    const state = fresh()
    state.players[0].board = [minion(1, 4)]
    state.players[1].board = [minion(2, 2)]
    const next = step(state, 0, { type: 'attack', attackerUid: 1, target: { kind: 'minion', uid: 2 } }).state
    expect(next.players[0].board).toHaveLength(0)
    expect(next.players[1].board).toHaveLength(0)
  })

  test('rejects unknown attackers and targets', () => {
    const state = fresh()
    state.players[0].board = [minion(1, 3)]
    expect(codeOf(() => step(state, 0, { type: 'attack', attackerUid: 99, target: { kind: 'hero' } }))).toBe('invalid_command')
    expect(codeOf(() => step(state, 0, { type: 'attack', attackerUid: 1, target: { kind: 'minion', uid: 999 } }))).toBe('illegal_target')
  })

  test('lethal damage ends the match', () => {
    const state = fresh()
    state.players[0].board = [minion(1, 3)]
    state.players[1].heroHealth = 2
    const { state: next, events } = step(state, 0, { type: 'attack', attackerUid: 1, target: { kind: 'hero' } })
    expect(next.winner).toBe(0)
    expect(events.at(-1)).toEqual({ type: 'game_over', winner: 0 })
    expect(codeOf(() => step(next, 0, endTurn))).toBe('invalid_command')
  })
})

describe('turns', () => {
  test('Aether grows each turn and caps at ten', () => {
    const afterOne = step(fresh(), 0, endTurn).state
    expect(afterOne.active).toBe(1)
    expect(afterOne.players[1]).toMatchObject({ aetherMax: 1, aether: 1 })
    expect(step(afterOne, 1, endTurn).state.players[0].aetherMax).toBe(2)

    const capped = fresh()
    capped.players[1].aetherMax = 10
    expect(step(capped, 0, endTurn).state.players[1]).toMatchObject({ aetherMax: 10, aether: 10 })
  })

  test('fatigue escalates on an empty deck', () => {
    let state = fresh()
    state.players[1].deck = []
    state = step(state, 0, endTurn).state
    expect(state.players[1].heroHealth).toBe(29)
    state = step(step(state, 1, endTurn).state, 0, endTurn).state
    expect(state.players[1].heroHealth).toBe(27)
  })

  test('a full hand burns the drawn card', () => {
    const state = fresh()
    state.players[1].hand = Array.from({ length: 10 }, () => cid(1))
    const { state: next, events } = step(state, 0, endTurn)
    expect(next.players[1].hand).toHaveLength(10)
    expect(events.some((event) => event.type === 'card_burned')).toBe(true)
  })

  test('a scripted game replays to the same state', () => {
    const run = (seed: number): MatchState => {
      let state = fresh(seed)
      for (const actor of [0, 1, 0, 1] as const) state = step(state, actor, endTurn).state
      return state
    }
    expect(run(5)).toEqual(run(5))
    expect(run(5)).not.toEqual(run(6))
  })
})