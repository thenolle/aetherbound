import { describe, expect, test } from 'bun:test'
import { createMatch } from '../rules/engine'
import type { Minion } from '../rules/types'
import { parseId } from '../shared/ids'
import { attackTarget, candidates, chooseTarget, playMatch } from './bot'
import { CONTENDERS, SIM_REGISTRY } from './contenders'
import { formatReport } from './report'
import { runTournament } from './tournament'

const mk = (uid: number, attack: number, health: number, extra: Partial<Minion> = {}): Minion => ({
  uid,
  cardId: (SIM_REGISTRY.keys().next().value ?? '') as Minion['cardId'],
  attack,
  health,
  maxHealth: health,
  exhausted: false,
  keywords: [],
  onDeath: [],
  ...extra
})

const setup = (seed: number) => {
  const first = CONTENDERS[0]
  const second = CONTENDERS[1]
  if (first === undefined || second === undefined) throw new Error('contenders missing')
  return {
    seed,
    registry: SIM_REGISTRY,
    players: [{ hero: first.hero, deck: first.deck }, { hero: second.hero, deck: second.deck }] as const
  }
}

const result = runTournament(CONTENDERS, SIM_REGISTRY, 1, 7)

describe('bot', () => {
  test('a bot match ends and is identical when replayed with the same seed', () => {
    const a = playMatch(setup(11))
    const b = playMatch(setup(11))
    expect(a.turns).toBeGreaterThan(1)
    expect(a.winner).toBe(b.winner)
    expect(a.turns).toBe(b.turns)
    expect([...a.played[0]].sort()).toEqual([...b.played[0]].sort())
    expect(a.played[0].size + a.played[1].size).toBeGreaterThan(0)
  })

  test('shield-walls are attacked first', () => {
    const wall = mk(2, 2, 2, { keywords: ['shield-wall'] })
    const weak = mk(3, 1, 1)
    expect(attackTarget(mk(1, 3, 3), [weak, wall])).toEqual({ kind: 'minion', uid: 2 })
    expect(attackTarget(mk(1, 1, 3), [mk(4, 1, 5, { keywords: ['shield-wall'] })])).toEqual({ kind: 'minion', uid: 4 })
  })

  test('it takes a safe kill, skips a warded minion and otherwise goes for the hero', () => {
    expect(attackTarget(mk(1, 3, 4), [mk(2, 1, 3), mk(3, 2, 2)])).toEqual({ kind: 'minion', uid: 2 })
    expect(attackTarget(mk(1, 3, 4), [mk(2, 1, 1, { warded: true })])).toEqual({ kind: 'hero' })
    expect(attackTarget(mk(1, 2, 2), [mk(2, 5, 5)])).toEqual({ kind: 'hero' })
  })

  test('removal goes to the best minion it can kill, skipping warded ones, and freezes go to the hardest hitter', () => {
    const damage = [{ kind: 'damage', amount: 3, target: 'chosen-enemy-minion' }] as const
    expect(chooseTarget(damage, [mk(1, 5, 5), mk(2, 3, 3), mk(3, 2, 2)])?.uid).toBe(2)
    expect(chooseTarget(damage, [mk(2, 3, 3, { warded: true }), mk(3, 1, 1)])?.uid).toBe(3)
    const freeze = [{ kind: 'freeze', target: 'chosen-enemy-minion' }] as const
    expect(chooseTarget(freeze, [mk(1, 1, 9), mk(2, 4, 2)])?.uid).toBe(2)
  })

  test('with lethal on board every ready minion goes for the hero, otherwise it takes the safe kill', () => {
    const state = createMatch(setup(3)).state
    const me = state.players[0]
    const foe = state.players[1]
    me.hand = []
    me.aether = 0
    me.board = [mk(1, 5, 5)]
    foe.board = [mk(2, 1, 1)]
    foe.heroHealth = 4
    expect(candidates(state, 0, SIM_REGISTRY).next().value).toEqual({ type: 'attack', attackerUid: 1, target: { kind: 'hero' } })
    foe.heroHealth = 30
    expect(candidates(state, 0, SIM_REGISTRY).next().value).toEqual({ type: 'attack', attackerUid: 1, target: { kind: 'minion', uid: 2 } })
  })

  test('a miracle card is held back until the healed threshold is within reach', () => {
    const state = createMatch(setup(4)).state
    const me = state.players[0]
    me.hand = [parseId('card', 'miracle-worker')]
    me.aether = 10
    me.healed = 0
    const plays = () => [...candidates(state, 0, SIM_REGISTRY)].filter((command) => command.type === 'play')
    expect(plays()).toHaveLength(0)
    me.healed = 6
    expect(plays()).toHaveLength(1)
  })
})

describe('tournament', () => {
  test('every ordered pairing is played and counted exactly once', () => {
    expect(result.total).toBe(CONTENDERS.length * CONTENDERS.length)
    for (const row of result.pairings) {
      for (const cell of row) expect(cell.firstWins + cell.secondWins + cell.draws).toBe(cell.games)
    }
  })

  test('the report names every faction and the match shape', () => {
    const report = formatReport(result, 1)
    for (const contender of CONTENDERS) expect(report).toContain(contender.name)
    expect(report).toContain('first seat wins')
    expect(report).toContain('Cards by win rate when played')
  })
})