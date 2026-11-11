import { describe, expect, test } from 'bun:test'
import type { HeroDefinition } from '../shared/cards'
import type { Effect } from '../shared/effects'
import { DomainError } from '../shared/errors'
import { applyCommand, createMatch } from './engine'
import { cid, fixtureDeck, fixtureHero, fixtureRegistry, fixtureSetup, stats } from './test-fixtures'
import type { Command, MatchState, Minion, PlayerIndex } from './types'

const setupWith = (effects: Effect[]) => {
  const hero: HeroDefinition = { ...fixtureHero, ability: { ...fixtureHero.ability, effects } }
  return {
    ...fixtureSetup(1),
    players: [
      { hero, deck: fixtureDeck },
      { hero: fixtureHero, deck: fixtureDeck }
    ] as const
  }
}

const start = (effects?: Effect[]): MatchState => {
  const state = createMatch(effects === undefined ? fixtureSetup(1) : setupWith(effects)).state
  state.players[0].aether = 10
  return state
}

const step = (state: MatchState, actor: PlayerIndex, command: Command) => applyCommand(state, actor, command, fixtureRegistry)

const codeOf = (fn: () => unknown): string | null => {
  try {
    fn()
    return null
  } catch (error) {
    return error instanceof DomainError ? error.code : 'non-domain-error'
  }
}

const ability: Command = { type: 'hero_ability' }
const endTurn: Command = { type: 'end_turn' }

describe('hero ability', () => {
  test('costs Aether, resolves its effects and is limited to once per turn', () => {
    const first = step(start(), 0, ability)
    expect(first.state.players[0].aether).toBe(8)
    expect(first.state.players[1].heroHealth).toBe(29)
    expect(first.events[0]).toEqual({ type: 'ability_used', player: 0 })
    expect(codeOf(() => step(first.state, 0, ability))).toBe('invalid_command')

    const later = step(step(first.state, 0, endTurn).state, 1, endTurn).state
    expect(step(later, 0, ability).state.players[1].heroHealth).toBe(28)
  })

  test('requires enough Aether', () => {
    const state = start()
    state.players[0].aether = 1
    expect(codeOf(() => step(state, 0, ability))).toBe('insufficient_aether')
  })

  test('a tariff cuts the opponent Aether on their next turn only', () => {
    const afterTariff = step(start([{ kind: 'tariff', amount: 1 }]), 0, ability)
    expect(afterTariff.events).toContainEqual({ type: 'taxed', player: 1, amount: 1 })
    const theirTurn = step(afterTariff.state, 0, endTurn).state
    expect(theirTurn.players[1]).toMatchObject({ aetherMax: 1, aether: 0, tariff: 0 })
    const backToThem = step(step(theirTurn, 1, endTurn).state, 0, endTurn).state
    expect(backToThem.players[1]).toMatchObject({ aetherMax: 2, aether: 2 })
  })

  test('a targeted ability needs a valid enemy minion', () => {
    const state = start([{ kind: 'damage', amount: 3, target: 'chosen-enemy-minion' }])
    const { attack, health } = stats(3)
    const target: Minion = { uid: 5, cardId: cid(3), attack, health, maxHealth: health, exhausted: false, keywords: [], onDeath: [] }
    state.players[1].board = [target]
    expect(codeOf(() => step(state, 0, ability))).toBe('illegal_target')
    expect(codeOf(() => step(state, 0, { type: 'hero_ability', targetUid: 99 }))).toBe('illegal_target')
    const next = step(state, 0, { type: 'hero_ability', targetUid: 5 }).state
    expect(next.players[1].board).toHaveLength(0)
  })

  test('a hero with a malformed ability is rejected when the match is created', () => {
    try {
      createMatch(setupWith([]))
      throw new Error('expected failure')
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe('invalid_content')
    }
  })
})