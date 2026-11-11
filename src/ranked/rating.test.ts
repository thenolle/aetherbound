import { describe, expect, test } from 'bun:test'
import { Rng } from '../shared/rng'
import { DEFAULT_RATING, expectedScore, updateRatings, visibleRank } from './rating'

const placed = { games: 50 }

describe('rating', () => {
  test('expected scores are symmetric and follow the logistic curve', () => {
    expect(expectedScore(1000, 1000, 400)).toBeCloseTo(0.5, 10)
    expect(expectedScore(1400, 1000, 400)).toBeCloseTo(0.9091, 3)
    expect(expectedScore(1200, 1000, 400) + expectedScore(1000, 1200, 400)).toBeCloseTo(1, 10)
  })

  test('equal placed players trade half a K', () => {
    const next = updateRatings({ mmr: 1000, ...placed }, { mmr: 1000, ...placed })
    expect(next.winner).toBeCloseTo(1012, 6)
    expect(next.loser).toBeCloseTo(988, 6)
  })

  test('an upset moves more points than an expected win, and placement games move more than later ones', () => {
    const upset = updateRatings({ mmr: 1000, ...placed }, { mmr: 1400, ...placed })
    const expected = updateRatings({ mmr: 1400, ...placed }, { mmr: 1000, ...placed })
    expect(upset.winner - 1000).toBeGreaterThan(expected.winner - 1400)
    const fresh = updateRatings({ mmr: 1000, games: 0 }, { mmr: 1000, games: 0 })
    expect(fresh.winner - 1000).toBeGreaterThan(upset.winner - 1000 - 12)
    expect(fresh.winner).toBeCloseTo(1024, 6)
  })

  test('the rating never drops below the floor', () => {
    expect(updateRatings({ mmr: 1000, ...placed }, { mmr: 3, ...placed }).loser).toBeGreaterThanOrEqual(DEFAULT_RATING.floor)
  })

  test('the visible rank stays hidden until placement is done, then maps to a league and division', () => {
    expect(visibleRank({ mmr: 1500, games: 4 })).toBeNull()
    expect(visibleRank({ mmr: 1000, games: 5 })).toEqual({ league: 'Brass', division: 2 })
    expect(visibleRank({ mmr: 0, games: 5 })).toEqual({ league: 'Iron', division: 4 })
    expect(visibleRank({ mmr: 1500, games: 5 })).toEqual({ league: 'Gold', division: 4 })
    expect(visibleRank({ mmr: 2600, games: 5 })).toEqual({ league: 'Gold', division: 1 })
  })

  test('simulated play recovers true skill order (seeded, reproducible)', () => {
    const rng = new Rng(7)
    const players = Array.from({ length: 100 }, () => ({ skill: rng.nextInt(801) - 400, mmr: 1000, games: 0 }))
    for (let round = 0; round < 20000; round += 1) {
      const a = rng.nextInt(100)
      let b = rng.nextInt(99)
      if (b >= a) b += 1
      const first = players[a]
      const second = players[b]
      if (first === undefined || second === undefined) throw new Error('missing player')
      const firstWins = rng.nextInt(1_000_000) / 1_000_000 < expectedScore(first.skill, second.skill, 400)
      const [winner, loser] = firstWins ? [first, second] : [second, first]
      const next = updateRatings(winner, loser)
      winner.mmr = next.winner
      loser.mmr = next.loser
      winner.games += 1
      loser.games += 1
    }
    const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length
    const skills = players.map((player) => player.skill)
    const ratings = players.map((player) => player.mmr)
    const [meanSkill, meanRating] = [mean(skills), mean(ratings)]
    let covariance = 0
    let skillSpread = 0
    let ratingSpread = 0
    players.forEach((player) => {
      covariance += (player.skill - meanSkill) * (player.mmr - meanRating)
      skillSpread += (player.skill - meanSkill) ** 2
      ratingSpread += (player.mmr - meanRating) ** 2
    })
    expect(covariance / Math.sqrt(skillSpread * ratingSpread)).toBeGreaterThan(0.9)
  })
})