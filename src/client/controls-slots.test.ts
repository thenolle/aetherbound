import { describe, expect, test } from 'bun:test'
import { createMatch } from '../rules/engine'
import { projectState } from '../rules/projection'
import { cid, fixtureSetup, makeCard } from '../rules/test-fixtures'
import { createRegistry } from '../shared/cards'
import { INITIAL_SELECTION, handleKey } from './controls'

const base = { attack: undefined, health: undefined, cost: 1 } as const

const registry = createRegistry([
  makeCard(1, { ...base, family: 'snare', trigger: 'enemy-play', effects: [{ kind: 'damage', amount: 1, target: 'enemy-hero' }] }),
  makeCard(2, { ...base, family: 'oath', goal: 2, effects: [{ kind: 'draw', count: 1 }] })
])

function view() {
  const state = createMatch(fixtureSetup(1)).state
  state.players[0].hand = [cid(1), cid(2)]
  return projectState(state, 0)
}

describe('slot keys', () => {
  test('p sets a snare and swears an oath', () => {
    const current = view()
    expect(handleKey('p', current, INITIAL_SELECTION, registry).command).toEqual({ type: 'set', handIndex: 0 })
    const onOath = handleKey('ArrowRight', current, INITIAL_SELECTION, registry).selection
    expect(handleKey('p', current, onOath, registry).command).toEqual({ type: 'swear', handIndex: 1 })
  })
})