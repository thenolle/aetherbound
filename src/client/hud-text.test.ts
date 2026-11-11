import { describe, expect, test } from 'bun:test'
import { createMatch } from '../rules/engine'
import { projectState } from '../rules/projection'
import { cid, fixtureRegistry, fixtureSetup } from '../rules/test-fixtures'
import { INITIAL_SELECTION } from './controls'
import { buildHud, describeEvent } from './hud-text'

const textOf = (lines: readonly { text: string }[]): string => lines.map((line) => line.text).join('\n')

describe('buildHud', () => {
  test('shows a waiting screen without a view', () => {
    const text = textOf(buildHud({ status: 'connecting', view: null, selection: INITIAL_SELECTION, notes: [], registry: fixtureRegistry }))
    expect(text).toContain('connecting')
    expect(text).toContain('waiting for the Concord Manifold')
  })

  test('shows turn, resources, hand and notes for a view', () => {
    const view = projectState(createMatch(fixtureSetup(1)).state, 0)
    const text = textOf(buildHud({ status: 'connected', view, selection: INITIAL_SELECTION, notes: ['hello note'], registry: fixtureRegistry }))
    expect(text).toContain('seat 0')
    expect(text).toContain('YOUR TURN')
    expect(text).toContain('aether 1/1')
    expect(text).toContain('Test Card')
    expect(text).toContain('hello note')
    expect(text).toContain('>1:')
  })
})

describe('describeEvent', () => {
  test('describes events with card names and hidden cards', () => {
    expect(describeEvent({ type: 'card_drawn', player: 1, cardId: null }, fixtureRegistry)).toBe('P1 draws a card')
    expect(describeEvent({ type: 'minion_played', player: 0, uid: 3, cardId: cid(1), position: 0 }, fixtureRegistry)).toBe('P0 plays Test Card 1 as #3')
    expect(describeEvent({ type: 'damaged', player: 1, uid: null, amount: 4 }, fixtureRegistry)).toBe('P1 hero takes 4')
    expect(describeEvent({ type: 'game_over', winner: 0 }, fixtureRegistry)).toBe('P0 wins')
  })
})