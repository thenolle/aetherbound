import { describe, expect, test } from 'bun:test'
import { DomainError } from '../shared/errors'
import { applyCommand, createMatch, timeoutTurn } from './engine'
import { fixtureRegistry, fixtureSetup } from './test-fixtures'
import type { Command, MatchState, PlayerIndex } from './types'

const fresh = (): MatchState => createMatch(fixtureSetup(1)).state

const step = (state: MatchState, actor: PlayerIndex, command: Command) => applyCommand(state, actor, command, fixtureRegistry)

const codeOf = (fn: () => unknown): string | null => {
  try {
    fn()
    return null
  } catch (error) {
    return error instanceof DomainError ? error.code : 'non-domain-error'
  }
}

describe('surrender', () => {
  test('the waiting player can surrender and loses', () => {
    const { state, events } = step(fresh(), 1, { type: 'surrender' })
    expect(state.winner).toBe(0)
    expect(events).toEqual([{ type: 'surrendered', player: 1 }, { type: 'game_over', winner: 0 }])
  })

  test('the active player can surrender and the match is then over', () => {
    const { state } = step(fresh(), 0, { type: 'surrender' })
    expect(state.winner).toBe(1)
    expect(codeOf(() => step(state, 0, { type: 'end_turn' }))).toBe('invalid_command')
  })
})

describe('timeoutTurn', () => {
  test('passes the turn and records the timeout first', () => {
    const { state, events } = timeoutTurn(fresh())
    expect(events[0]).toEqual({ type: 'turn_timed_out', player: 0 })
    expect(state.active).toBe(1)
    expect(state.turn).toBe(2)
  })

  test('is rejected once the match is over', () => {
    const { state } = step(fresh(), 0, { type: 'surrender' })
    expect(codeOf(() => timeoutTurn(state))).toBe('invalid_command')
  })
})