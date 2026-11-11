import type { Database } from 'bun:sqlite'
import { DEFAULT_RATING, updateRatings } from '../ranked/rating'
import type { Rated, RatingConfig } from '../ranked/rating'
import { withTransaction } from './database'

type Prepared = ReturnType<Database['prepare']>

export type RatingUpdate = Readonly<{
  matchId: string
  winnerId: string
  loserId: string
  winnerBefore: number
  winnerAfter: number
  loserBefore: number
  loserAfter: number
}>

export class SqliteRatingStore {
  private readonly db: Database
  private readonly now: () => number
  private readonly config: RatingConfig
  private readonly selectRating: Prepared
  private readonly upsertRating: Prepared
  private readonly selectUpdate: Prepared
  private readonly insertUpdate: Prepared

  constructor(db: Database, now: () => number, config: RatingConfig = DEFAULT_RATING) {
    this.db = db
    this.now = now
    this.config = config
    this.selectRating = db.prepare('SELECT mmr, games FROM ratings WHERE account_id = ?1')
    this.upsertRating = db.prepare(
      `INSERT INTO ratings (account_id, mmr, games, updated_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (account_id) DO UPDATE SET mmr = excluded.mmr, games = excluded.games, updated_at = excluded.updated_at`
    )
    this.selectUpdate = db.prepare('SELECT 1 AS found FROM rating_updates WHERE match_id = ?1')
    this.insertUpdate = db.prepare(
      'INSERT INTO rating_updates (match_id, winner_id, loser_id, winner_before, winner_after, loser_before, loser_after, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)'
    )
  }

  get(accountId: string): Rated {
    return (this.selectRating.get(accountId) as Rated | null) ?? { mmr: this.config.initial, games: 0 }
  }

  applyResult(matchId: string, winnerId: string, loserId: string): RatingUpdate | null {
    if (winnerId === loserId) throw new Error('a player cannot play themselves')
    return withTransaction(this.db, () => {
      if (this.selectUpdate.get(matchId) !== null) return null
      const winner = this.get(winnerId)
      const loser = this.get(loserId)
      const next = updateRatings(winner, loser, this.config)
      const now = this.now()
      this.upsertRating.run(winnerId, next.winner, winner.games + 1, now)
      this.upsertRating.run(loserId, next.loser, loser.games + 1, now)
      this.insertUpdate.run(matchId, winnerId, loserId, winner.mmr, next.winner, loser.mmr, next.loser, now)
      return { matchId, winnerId, loserId, winnerBefore: winner.mmr, winnerAfter: next.winner, loserBefore: loser.mmr, loserAfter: next.loser }
    })
  }
}