import { describe, expect, test } from 'bun:test'
import type { Minion } from '../rules/types'
import { attackTarget, playMatch } from './bot'
import { CONTENDERS, SIM_REGISTRY } from './contenders'
import { formatReport } from './report'
import { runTournament } from './tournament'

const mk = (uid: number, attack: number, health: number, extra: Partial<Minion> = {}): Minion => ({
  uid,
  cardId: CONTENDERS[0]?.deck[0] ?? ('' as never),
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