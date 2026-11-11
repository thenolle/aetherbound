import { describe, expect, test } from 'bun:test'
import { createMatch } from '../rules/engine'
import { projectState } from '../rules/projection'
import { cid, fixtureSetup, makeCard } from '../rules/test-fixtures'
import { createRegistry } from '../shared/cards'
import { INITIAL_SELECTION, handleKey } from './controls'

const holding = { family: 'holding', attack: undefined, health: undefined, cost: 1, durability: 2 } as const

const registry = createRegistry([
  makeCard(1, { ...holding, effects: [{ kind: 'damage', amount: 1, target: 'enemy-hero' }] }),
  makeCard(2, { ...holding, effects: [{ kind: 'damage', amount: 2, target: 'chosen-enemy-minion' }] })
])

function view() {
  const state = createMatch(fixtureSetup(1)).state
  state.players[0].hand = [cid(1)]
  state.players[0].holdings = [
    { uid: 7, cardId: cid(1), charges: 2, used: false },
    { uid: 8, cardId: cid(2), charges: 2, used: false }
  ]
  state.players[1].board = [{ uid: 5, cardId: cid(1), attack: 1, health: 3, maxHealth: 3, exhausted: false, keywords: [], onDeath: [] }]
  return projectState(state, 0)
}

describe('holding keys', () => {
  test('p places a selected holding card', () => {
    expect(handleKey('p', view(), INITIAL_SELECTION, registry).command).toEqual({ type: 'place', handIndex: 0 })
  })

  test('n selects a holding and k activates it, asking for a target when needed', () => {
    const current = view()
    expect(handleKey('k', current, INITIAL_SELECTION, registry).command).toEqual({ type: 'activate', holdingUid: 7 })

    const onSecond = handleKey('n', current, INITIAL_SELECTION, registry).selection
    const missing = handleKey('k', current, onSecond, registry)
    expect(missing.command).toBeNull()
    expect(missing.note).toContain('pick an enemy minion')

    const targeted = handleKey('t', current, onSecond, registry).selection
    expect(handleKey('k', current, targeted, registry).command).toEqual({ type: 'activate', holdingUid: 8, targetUid: 5 })
  })
})