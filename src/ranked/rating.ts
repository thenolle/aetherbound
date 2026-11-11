export type RatingConfig = Readonly<{
  initial: number
  scale: number
  kPlacement: number
  kStandard: number
  placementGames: number
  floor: number
}>

export const DEFAULT_RATING: RatingConfig = {
  initial: 1000,
  scale: 400,
  kPlacement: 48,
  kStandard: 24,
  placementGames: 5,
  floor: 0
}

export type Rated = Readonly<{ mmr: number, games: number }>

export type VisibleRank = Readonly<{ league: string, division: number }>

export const LEAGUES = [
  { name: 'Iron', min: 0 },
  { name: 'Brass', min: 900 },
  { name: 'Verdigris', min: 1100 },
  { name: 'Bronze', min: 1300 },
  { name: 'Gold', min: 1500 }
] as const

const TOP_BAND = 200
const DIVISIONS = 4

export function expectedScore(own: number, other: number, scale: number): number {
  return 1 / (1 + 10 ** ((other - own) / scale))
}

const kFor = (games: number, config: RatingConfig): number => (games < config.placementGames ? config.kPlacement : config.kStandard)

export function updateRatings(winner: Rated, loser: Rated, config: RatingConfig = DEFAULT_RATING): { winner: number, loser: number } {
  const expectedWinner = expectedScore(winner.mmr, loser.mmr, config.scale)
  return {
    winner: winner.mmr + kFor(winner.games, config) * (1 - expectedWinner),
    loser: Math.max(config.floor, loser.mmr - kFor(loser.games, config) * (1 - expectedWinner))
  }
}

export function visibleRank(rated: Rated, config: RatingConfig = DEFAULT_RATING): VisibleRank | null {
  if (rated.games < config.placementGames) return null
  let index = 0
  LEAGUES.forEach((league, position) => {
    if (rated.mmr >= league.min) index = position
  })
  const league = LEAGUES[index]
  if (league === undefined) return null
  const next = LEAGUES[index + 1]
  const band = next === undefined ? TOP_BAND : next.min - league.min
  const step = band / DIVISIONS
  return { league: league.name, division: DIVISIONS - Math.min(DIVISIONS - 1, Math.floor((rated.mmr - league.min) / step)) }
}