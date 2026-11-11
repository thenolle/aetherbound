import type { Database } from 'bun:sqlite'

type Prepared = ReturnType<Database['prepare']>

export type FlagKind = 'short_match' | 'repeat_pair' | 'win_trading'
export type IntegrityFlag = Readonly<{ id: string, matchId: string, kind: FlagKind, detail: string, createdAt: number }>
export type IntegrityRules = Readonly<{ windowMs: number, repeatPairLimit: number, shortMatchInputs: number, tradeStreak: number }>

export const INTEGRITY_RULES: IntegrityRules = {
  windowMs: 86_400_000,
  repeatPairLimit: 5,
  shortMatchInputs: 6,
  tradeStreak: 6
}

type MatchRow = { mode: string, winner: number | null, account_0: string | null, account_1: string | null, ended_at: number | null }
type FlagRow = { id: string, match_id: string, kind: FlagKind, detail: string, created_at: number }

export class IntegrityStore {
  private readonly now: () => number
  private readonly rules: IntegrityRules
  private readonly selectMatch: Prepared
  private readonly countInputs: Prepared
  private readonly countPair: Prepared
  private readonly lastPair: Prepared
  private readonly insertFlag: Prepared
  private readonly selectOpen: Prepared
  private readonly markReviewed: Prepared

  constructor(db: Database, now: () => number, rules: IntegrityRules = INTEGRITY_RULES) {
    this.now = now
    this.rules = rules
    this.selectMatch = db.prepare('SELECT mode, winner, account_0, account_1, ended_at FROM matches WHERE id = ?1')
    this.countInputs = db.prepare('SELECT COUNT(*) AS n FROM match_log WHERE match_id = ?1')
    const samePair = '((account_0 = ?1 AND account_1 = ?2) OR (account_0 = ?2 AND account_1 = ?1))'
    this.countPair = db.prepare(`SELECT COUNT(*) AS n FROM matches WHERE mode = 'ranked' AND winner IS NOT NULL AND ${samePair} AND ended_at >= ?3 AND ended_at <= ?4`)
    this.lastPair = db.prepare(`SELECT winner, account_0, account_1 FROM matches WHERE mode = 'ranked' AND winner IS NOT NULL AND ${samePair} AND ended_at <= ?4 ORDER BY ended_at DESC LIMIT ?3`)
    this.insertFlag = db.prepare('INSERT OR IGNORE INTO integrity_flags (id, match_id, kind, detail, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    this.selectOpen = db.prepare('SELECT id, match_id, kind, detail, created_at FROM integrity_flags WHERE reviewed_at IS NULL ORDER BY created_at LIMIT ?1')
    this.markReviewed = db.prepare('UPDATE integrity_flags SET reviewed_at = ?1 WHERE id = ?2 AND reviewed_at IS NULL')
  }

  inspect(matchId: string): FlagKind[] {
    const match = this.selectMatch.get(matchId) as MatchRow | null
    if (match === null || match.mode !== 'ranked' || match.winner === null) return []
    if (match.account_0 === null || match.account_1 === null || match.ended_at === null) return []
    const raised: FlagKind[] = []
    const flag = (kind: FlagKind, detail: string): void => { if (this.insertFlag.run(crypto.randomUUID(), matchId, kind, detail, this.now()).changes > 0) raised.push(kind) }
    const inputs = (this.countInputs.get(matchId) as { n: number }).n
    if (inputs < this.rules.shortMatchInputs) flag('short_match', `${inputs} recorded inputs`)
    const recent = (this.countPair.get(match.account_0, match.account_1, match.ended_at - this.rules.windowMs, match.ended_at) as { n: number }).n
    if (recent >= this.rules.repeatPairLimit) flag('repeat_pair', `${recent} ranked matches between the same two accounts in the last day`)
    const last = this.lastPair.all(match.account_0, match.account_1, this.rules.tradeStreak, match.ended_at) as { winner: number, account_0: string, account_1: string }[]
    const winners = last.map((row) => (row.winner === 0 ? row.account_0 : row.account_1))
    const alternating = winners.length === this.rules.tradeStreak && winners.every((winner, index) => index === 0 || winner !== winners[index - 1])
    if (alternating) flag('win_trading', `the last ${this.rules.tradeStreak} matches between these accounts strictly alternated winners`)
    return raised
  }

  openFlags(limit: number): IntegrityFlag[] {
    return (this.selectOpen.all(limit) as FlagRow[]).map((row) => ({
      id: row.id,
      matchId: row.match_id,
      kind: row.kind,
      detail: row.detail,
      createdAt: row.created_at
    }))
  }

  review(flagId: string): boolean {
    return this.markReviewed.run(this.now(), flagId).changes > 0
  }
}