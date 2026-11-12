import type { CardRegistry } from '../shared/cards'
import { playMatch } from './bot'
import type { Contender } from './contenders'

export type PairingStats = {
  firstWins: number
  secondWins: number
  draws: number
  turns: number
  games: number
}

export type CardStats = { played: number, won: number }

export type TournamentResult = Readonly<{
  names: readonly string[]
  pairings: readonly (readonly PairingStats[])[]
  cards: ReadonlyMap<string, CardStats>
  total: number
}>

export function runTournament(contenders: readonly Contender[], registry: CardRegistry, games: number, baseSeed: number): TournamentResult {
  const pairings = contenders.map(() => contenders.map((): PairingStats => ({ firstWins: 0, secondWins: 0, draws: 0, turns: 0, games: 0 })))
  const cards = new Map<string, CardStats>()
  let seed = baseSeed
  let total = 0
  for (const [i, first] of contenders.entries()) {
    for (const [j, second] of contenders.entries()) {
      const cell = pairings[i]?.[j]
      if (cell === undefined) continue
      for (let game = 0; game < games; game += 1) {
        const outcome = playMatch({
          seed,
          registry,
          players: [{ hero: first.hero, deck: first.deck }, { hero: second.hero, deck: second.deck }]
        })
        seed += 1
        total += 1
        cell.games += 1
        cell.turns += outcome.turns
        if (outcome.winner === 0) cell.firstWins += 1
        else if (outcome.winner === 1) cell.secondWins += 1
        else cell.draws += 1
        if (outcome.winner === null) continue
        for (const seat of [0, 1] as const) {
          for (const cardId of outcome.played[seat]) {
            const stats = cards.get(cardId) ?? { played: 0, won: 0 }
            stats.played += 1
            if (outcome.winner === seat) stats.won += 1
            cards.set(cardId, stats)
          }
        }
      }
    }
  }
  return { names: contenders.map((entry) => entry.name), pairings, cards, total }
}