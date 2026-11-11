import { describe, expect, test } from 'bun:test'
import { createMatch } from '../rules/engine'
import { projectState } from '../rules/projection'
import type { MatchView } from '../rules/projection'
import { cid, fixtureSetup, makeCard } from '../rules/test-fixtures'
import type { PlayerIndex } from '../rules/types'
import { createRegistry } from '../shared/cards'
import { INITIAL_SELECTION, handleKey } from './controls'

const registry = createRegistry([
  makeCard(1, { cost: 1 }),
  makeCard(2, {
    family: 'writ',
    attack: undefined,
    health: undefined,
    cost: 1,
    effects: [{ kind: 'damage', amount: 2, target: 'chosen-enemy-minion' }]
  }),
  makeCard(3, { family: 'iron', health: undefined, attack: 2, durability: 2, cost: 1 })
])

function viewWith(options: { hand?: number[], active?: PlayerIndex, mine?: boolean, foe?: boolean } = {}): MatchView {
  const state = createMatch(fixtureSetup(1)).state
  state.active = options.active ?? 0
  state.players[0].hand = (options.hand ?? [1, 2, 3]).map(cid)
  if (options.mine) {
    state.players[0].board = [{ uid: 1, cardId: cid(1), attack: 2, health: 2, maxHealth: 2, exhausted: false, keywords: [], onDeath: [] }]
  }
  if (options.foe) {
    state.players[1].board = [{ uid: 5, cardId: cid(1), attack: 1, health: 3, maxHealth: 3, exhausted: false, keywords: [], onDeath: [] }]
  }
  return projectState(state, 0)
}

describe('handleKey', () => {
  test('end turn is issued on your turn and refused otherwise', () => {
    expect(handleKey('e', viewWith(), INITIAL_SELECTION, registry).command).toEqual({ type: 'end_turn' })
    const refused = handleKey('e', viewWith({ active: 1 }), INITIAL_SELECTION, registry)
    expect(refused.command).toBeNull()
    expect(refused.note).toContain('not your turn')
  })

  test('p plays, casts or equips depending on the selected card', () => {
    const view = viewWith({ foe: true })
    expect(handleKey('p', view, INITIAL_SELECTION, registry).command).toEqual({ type: 'play', handIndex: 0, position: 0 })

    const onWrit = handleKey('ArrowRight', view, INITIAL_SELECTION, registry).selection
    const noTarget = handleKey('p', view, onWrit, registry)
    expect(noTarget.command).toBeNull()
    expect(noTarget.note).toContain('pick an enemy minion')

    const targeted = handleKey('t', view, onWrit, registry).selection
    expect(handleKey('p', view, targeted, registry).command).toEqual({ type: 'cast', handIndex: 1, targetUid: 5 })

    const onIron = handleKey('ArrowRight', view, targeted, registry).selection
    expect(handleKey('p', view, onIron, registry).command).toEqual({ type: 'equip', handIndex: 2 })
  })

  test('a and h use the selected minion and target', () => {
    const view = viewWith({ mine: true, foe: true })
    expect(handleKey('a', view, INITIAL_SELECTION, registry).command).toEqual({ type: 'attack', attackerUid: 1, target: { kind: 'hero' } })
    const onMinion = handleKey('t', view, INITIAL_SELECTION, registry).selection
    expect(handleKey('a', view, onMinion, registry).command).toEqual({ type: 'attack', attackerUid: 1, target: { kind: 'minion', uid: 5 } })
    expect(handleKey('h', view, onMinion, registry).command).toEqual({ type: 'hero_attack', target: { kind: 'minion', uid: 5 } })
    expect(handleKey('a', viewWith({ foe: true }), INITIAL_SELECTION, registry).note).toContain('no minion')
  })

  test('the hero ability is issued with its cost handled by the server', () => {
    expect(handleKey('b', viewWith(), INITIAL_SELECTION, registry).command).toEqual({ type: 'hero_ability' })
    expect(handleKey('b', viewWith({ active: 1 }), INITIAL_SELECTION, registry).command).toBeNull()
  })

  test('surrender needs two presses and any other key disarms it', () => {
    const view = viewWith()
    const armed = handleKey('s', view, INITIAL_SELECTION, registry)
    expect(armed.command).toBeNull()
    expect(armed.selection.surrenderArmed).toBe(true)
    expect(handleKey('s', view, armed.selection, registry).command).toEqual({ type: 'surrender' })
    const disarmed = handleKey('m', view, armed.selection, registry)
    expect(disarmed.selection.surrenderArmed).toBe(false)
    expect(handleKey('s', view, disarmed.selection, registry).command).toBeNull()
  })

  test('arrows wrap around the hand', () => {
    const view = viewWith()
    expect(handleKey('ArrowLeft', view, INITIAL_SELECTION, registry).selection.hand).toBe(2)
    expect(handleKey('ArrowRight', view, { ...INITIAL_SELECTION, hand: 2 }, registry).selection.hand).toBe(0)
  })
})