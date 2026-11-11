import type { Database } from 'bun:sqlite'
import { DEFAULT_RATING, visibleRank } from '../ranked/rating'
import type { RatingConfig } from '../ranked/rating'
import { withTransaction } from './database'

export type Season = Readonly<{ id: number, name: string, startedAt: number, endedAt: number | null }>
export type LeaderboardEntry = Readonly<{ position: number, name: string, league: string, division: number, games: number }>
export type SeasonReset = Readonly<{ keep: number, gamesAfter: number }>
export type SeasonClose = Readonly<{ closed: Season, next: Season, archived: number }>

export const SEASON_RESET: SeasonReset = { keep: 0.5, gamesAfter: 3 }

type Prepared = ReturnType<Database['prepare']>
type SeasonRow = { id: number, name: string, started_at: number, ended_at: number | null }

const toSeason = (row: SeasonRow): Season => ({ id: row.id, name: row.name, startedAt: row.started_at, endedAt: row.ended_at })

export class SeasonStore {
  private readonly db: Database
  private readonly now: () => number
  private readonly config: RatingConfig
  private readonly reset: SeasonReset
  private readonly selectCurrent: Prepared
  private readonly insertSeason: Prepared
  private readonly endSeason: Prepared
  private readonly selectRatings: Prepared
  private readonly insertResult: Prepared
  private readonly updateRating: Prepared
  private readonly selectLeaders: Prepared

  constructor(db: Database, now: () => number, config: RatingConfig = DEFAULT_RATING, reset: SeasonReset = SEASON_RESET) {
    this.db = db
    this.now = now
    this.config = config
    this.reset = reset
    this.selectCurrent = db.prepare('SELECT id, name, started_at, ended_at FROM seasons WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1')
    this.insertSeason = db.prepare('INSERT INTO seasons (id, name, started_at) VALUES (?1, ?2, ?3)')
    this.endSeason = db.prepare('UPDATE seasons SET ended_at = ?1 WHERE id = ?2')
    this.selectRatings = db.prepare('SELECT account_id, mmr, games FROM ratings')
    this.insertResult = db.prepare('INSERT INTO season_results (season_id, account_id, final_mmr, games, league, division) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    this.updateRating = db.prepare('UPDATE ratings SET mmr = ?1, games = ?2, updated_at = ?3 WHERE account_id = ?4')
    this.selectLeaders = db.prepare(`SELECT a.display_name AS name, r.mmr, r.games FROM ratings r JOIN accounts a ON a.id = r.account_id WHERE r.games >= ?1 ORDER BY r.mmr DESC, r.games DESC, a.created_at ASC LIMIT ?2`)
  }

  current(): Season {
    return withTransaction(this.db, () => this.ensureCurrent())
  }

  closeSeason(): SeasonClose {
    return withTransaction(this.db, () => {
      const closed = this.ensureCurrent()
      const now = this.now()
      let archived = 0
      for (const row of this.selectRatings.all() as { account_id: string, mmr: number, games: number }[]) {
        const rank = visibleRank({ mmr: row.mmr, games: row.games }, this.config)
        if (rank !== null) {
          this.insertResult.run(closed.id, row.account_id, row.mmr, row.games, rank.league, rank.division)
          archived += 1
        }
        const softened = this.config.initial + (row.mmr - this.config.initial) * this.reset.keep
        this.updateRating.run(softened, Math.min(row.games, this.reset.gamesAfter), now, row.account_id)
      }
      this.endSeason.run(now, closed.id)
      const next: Season = { id: closed.id + 1, name: `Season ${closed.id + 1}`, startedAt: now, endedAt: null }
      this.insertSeason.run(next.id, next.name, next.startedAt)
      return { closed: { ...closed, endedAt: now }, next, archived }
    })
  }

  leaderboard(limit: number): LeaderboardEntry[] {
    const rows = this.selectLeaders.all(this.config.placementGames, limit) as { name: string, mmr: number, games: number }[]
    const entries: LeaderboardEntry[] = []
    rows.forEach((row, index) => {
      const rank = visibleRank({ mmr: row.mmr, games: row.games }, this.config)
      if (rank !== null) entries.push({ position: index + 1, name: row.name, league: rank.league, division: rank.division, games: row.games })
    })
    return entries
  }

  private ensureCurrent(): Season {
    const row = this.selectCurrent.get() as SeasonRow | null
    if (row !== null) return toSeason(row)
    const first: Season = { id: 1, name: 'Season 1', startedAt: this.now(), endedAt: null }
    this.insertSeason.run(first.id, first.name, first.startedAt)
    return first
  }
}