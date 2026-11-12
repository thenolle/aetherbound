import type { PairingStats, TournamentResult } from './tournament'

const decisive = (cell: PairingStats): number => cell.firstWins + cell.secondWins

const pct = (part: number, whole: number): string => (whole === 0 ? '--' : ((part / whole) * 100).toFixed(1)).padStart(5)

const flag = (part: number, whole: number): string => {
  if (whole === 0) return ''
  const rate = part / whole
  if (rate < 0.45) return '  LOW'
  return rate > 0.55 ? '  HIGH' : ''
}

export function formatReport(result: TournamentResult, minPlays = 40): string {
  const { names, pairings } = result
  const lines: string[] = ['Faction win rate (non-mirror games, both seats)']
  const cell = (i: number, j: number): PairingStats | undefined => pairings[i]?.[j]
  const versus = (i: number, j: number): { wins: number, games: number } => {
    const forward = cell(i, j)
    const back = cell(j, i)
    if (forward === undefined || back === undefined) return { wins: 0, games: 0 }
    return { wins: forward.firstWins + back.secondWins, games: decisive(forward) + decisive(back) }
  }
  for (const [i, name] of names.entries()) {
    let wins = 0
    let games = 0
    for (const j of names.keys()) {
      if (i === j) continue
      const line = versus(i, j)
      wins += line.wins
      games += line.games
    }
    lines.push(`${name.padEnd(18)} ${pct(wins, games)}%${flag(wins, games)}`)
  }
  lines.push('', 'Matchups (row beats column, %)')
  lines.push(`${''.padEnd(18)} ${names.map((name) => name.slice(0, 6).padStart(7)).join('')}`)
  for (const [i, name] of names.entries()) {
    const row = [...names.keys()].map((j) => {
      if (i === j) return '     --'
      const line = versus(i, j)
      return pct(line.wins, line.games).padStart(7)
    })
    lines.push(`${name.padEnd(18)} ${row.join('')}`)
  }
  let firstWins = 0
  let games = 0
  let draws = 0
  let turns = 0
  for (const row of pairings) {
    for (const entry of row) {
      firstWins += entry.firstWins
      games += decisive(entry)
      draws += entry.draws
      turns += entry.turns
    }
  }
  const every = games + draws
  lines.push('', 'Match shape')
  lines.push(`first seat wins    ${pct(firstWins, games)}%${flag(firstWins, games)}`)
  lines.push(`draws (turn cap)   ${draws} of ${every}`)
  lines.push(`average turns      ${every === 0 ? '--' : (turns / every).toFixed(1)}`)
  const ranked = [...result.cards.entries()].filter(([, stats]) => stats.played >= minPlays).map(([id, stats]) => ({ id, rate: stats.won / stats.played, played: stats.played })).sort((a, b) => b.rate - a.rate || a.id.localeCompare(b.id))
  lines.push('', `Cards by win rate when played (at least ${minPlays} plays)`)
  if (ranked.length === 0) {
    lines.push('not enough plays yet')
  } else {
    const row = (entry: { id: string, rate: number, played: number }): string => `${entry.id.padEnd(28)} ${(entry.rate * 100).toFixed(1).padStart(5)}%  ${String(entry.played).padStart(6)} plays`
    lines.push('strongest', ...ranked.slice(0, 8).map(row), 'weakest', ...ranked.slice(-8).reverse().map(row))
  }
  return lines.join('\n')
}