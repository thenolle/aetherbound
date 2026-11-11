import { describe, expect, test } from 'bun:test'
import { createMatch } from './engine'
import { projectEvent, projectState } from './projection'
import { cid, fixtureSetup } from './test-fixtures'

describe('projectState', () => {
  const state = createMatch(fixtureSetup(1)).state
  state.players[0].hand = [cid(1)]
  state.players[0].deck = [cid(2)]
  state.players[1].hand = [cid(15)]
  state.players[1].deck = [cid(14)]

  test('never leaks the opponent hand, any deck order or engine internals', () => {
    const text = JSON.stringify(projectState(state, 0))
    expect(text).not.toContain('test-15')
    expect(text).not.toContain('test-14')
    expect(text).not.toContain('test-02')
    expect(text).not.toContain('rngState')
    expect(text).not.toContain('nextUid')
  })

  test('shows the viewer their own hand and only counts for hidden zones', () => {
    const view = projectState(state, 0)
    expect(view.self.hand).toEqual([cid(1)])
    expect(view.self.deckCount).toBe(1)
    expect(view.opponent.handCount).toBe(1)
    expect(view.opponent.deckCount).toBe(1)
    expect(view.viewer).toBe(0)
  })
})

describe('projectEvent', () => {
  test('hides what the opponent drew but not what you drew or burned cards', () => {
    const drawn = { type: 'card_drawn', player: 1, cardId: cid(7) } as const
    expect(projectEvent(drawn, 0)).toEqual({ type: 'card_drawn', player: 1, cardId: null })
    expect(projectEvent(drawn, 1)).toEqual(drawn)
    const burned = { type: 'card_burned', player: 1, cardId: cid(7) } as const
    expect(projectEvent(burned, 0)).toEqual(burned)
  })
})