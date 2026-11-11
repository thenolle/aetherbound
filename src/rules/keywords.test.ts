import { describe, expect, test } from 'bun:test'
import { createRegistry } from '../shared/cards'
import { DomainError } from '../shared/errors'
import type { KeywordId } from '../shared/lexicon'
import { applyCommand, createMatch } from './engine'
import { cid, fixtureSetup, makeCard, stats } from './test-fixtures'
import type { Command, MatchState, Minion, PlayerIndex } from './types'

const registry = createRegistry([makeCard(1, { keywords: ['haste'] })])

const fresh = (): MatchState => createMatch(fixtureSetup(1)).state

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
  return { uid, cardId: cid(n), attack, health, maxHealth: health, exhausted: false, keywords }
}

const hitHero: Command = { type: 'attack', attackerUid: 1, target: { kind: 'hero' } }

describe('haste', () => {
  test('a hasty minion can attack the turn it is played', () => {
    const state = fresh()
    state.players[0].hand = [cid(1)]
    state.players[0].aether = 1
    const played = step(state, 0, { type: 'play', handIndex: 0, position: 0 }).state
    expect(played.players[0].board[0]).toMatchObject({ exhausted: false, keywords: ['haste'] })
    const hit = step(played, 0, hitHero).state
    expect(hit.players[1].heroHealth).toBe(29)
  })
})

describe('shield-wall', () => {
  const setup = (): MatchState => {
    const state = fresh()
    state.players[0].board = [mk(1, 3)]
    state.players[1].board = [mk(2, 2, ['shield-wall']), mk(3, 1)]
    return state
  }

  test('blocks attacks on the hero', () => {
    expect(codeOf(() => step(setup(), 0, hitHero))).toBe('illegal_target')
  })

  test('blocks attacks on other minions', () => {
    expect(codeOf(() => step(setup(), 0, { type: 'attack', attackerUid: 1, target: { kind: 'minion', uid: 3 } }))).toBe('illegal_target')
  })

  test('can itself be attacked, then the wall falls', () => {
    const { state } = step(setup(), 0, { type: 'attack', attackerUid: 1, target: { kind: 'minion', uid: 2 } })
    expect(state.players[1].board.map((minion) => minion.uid)).toEqual([3])
    expect(state.players[0].board[0]?.health).toBe(1)
  })
})