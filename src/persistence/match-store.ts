import type { Database } from 'bun:sqlite'
import { decodeCommandFrame, encodeCommandFrame } from '../protocol/commands'
import type { MatchSetup } from '../rules/engine'
import type { InputEntry } from '../rules/session'
import type { PlayerIndex } from '../rules/types'
import { parseId } from '../shared/ids'
import type { Id } from '../shared/ids'
import { VERSIONS } from '../shared/versions'
import { withTransaction } from './database'

type Prepared = ReturnType<Database['prepare']>

export type MatchHeader = Readonly<{
  id: string
  createdAt: number
  rulesVersion: number
  contentSchemaVersion: number
  seed: number
  heroes: readonly [string, string]
  decks: readonly [readonly Id<'card'>[], readonly Id<'card'>[]]
  accounts: readonly [string | null, string | null]
  mode: MatchMode
}>

export type MatchOutcome = Readonly<{ winner: PlayerIndex, endedAt: number }>

export type MatchMode = 'casual' | 'ranked'

export type StoredMatch = Readonly<{
  header: MatchHeader
  outcome: MatchOutcome | null
  entries: readonly InputEntry[]
}>

export type MatchSummary = Readonly<{
  id: string
  createdAt: number
  endedAt: number | null
  seat: PlayerIndex
  opponent: string
  result: 'win' | 'loss' | 'unfinished'
}>

export type MatchRecorder = {
  begin(header: MatchHeader): void
  append(matchId: string, firstIndex: number, entries: readonly InputEntry[], outcome: MatchOutcome | null): void
}

type MatchRow = {
  id: string
  created_at: number
  rules_version: number
  content_schema_version: number
  seed: number
  hero_0: string
  hero_1: string
  deck_0: string
  deck_1: string
  winner: number | null
  ended_at: number | null
  account_0: string | null
  account_1: string | null
  mode: string
}

type EntryRow = { idx: number, kind: string, actor: number | null, frame: Uint8Array | null }

type SummaryRow = {
  id: string
  created_at: number
  winner: number | null
  ended_at: number | null
  account_0: string | null
  name_0: string | null
  name_1: string | null
}

export function describeMatch(matchId: string, setup: MatchSetup, createdAt: number, accounts: readonly [string | null, string | null] = [null, null], mode: MatchMode = 'casual'): MatchHeader {
  return {
    id: matchId,
    createdAt,
    rulesVersion: VERSIONS.rules,
    contentSchemaVersion: VERSIONS.contentSchema,
    seed: setup.seed,
    heroes: [setup.players[0].hero.id, setup.players[1].hero.id],
    decks: [[...setup.players[0].deck], [...setup.players[1].deck]],
    accounts,
    mode
  }
}

function toMode(value: string): MatchMode {
  if (value === 'casual' || value === 'ranked') return value
  throw new Error('corrupt mode column')
}

function parseDeck(text: string): Id<'card'>[] {
  const value: unknown = JSON.parse(text)
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string')) throw new Error('corrupt deck column')
  return value.map((id) => parseId('card', id))
}

function toPlayer(value: number | null): PlayerIndex {
  if (value === 0 || value === 1) return value
  throw new Error('corrupt actor column')
}

export class SqliteMatchStore implements MatchRecorder {
  private readonly db: Database
  private readonly insertMatch: Prepared
  private readonly nextIndex: Prepared
  private readonly insertEntry: Prepared
  private readonly finishMatch: Prepared
  private readonly selectMatch: Prepared
  private readonly selectEntries: Prepared
  private readonly selectSummaries: Prepared

  constructor(db: Database) {
    this.db = db
    this.insertMatch = db.prepare('INSERT INTO matches (id, created_at, rules_version, content_schema_version, seed, hero_0, hero_1, deck_0, deck_1, account_0, account_1, mode) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)')
    this.nextIndex = db.prepare('SELECT COALESCE(MAX(idx) + 1, 0) AS next FROM match_log WHERE match_id = ?1')
    this.insertEntry = db.prepare('INSERT INTO match_log (match_id, idx, kind, actor, frame) VALUES (?1, ?2, ?3, ?4, ?5)')
    this.finishMatch = db.prepare('UPDATE matches SET winner = ?1, ended_at = ?2 WHERE id = ?3 AND winner IS NULL')
    this.selectMatch = db.prepare('SELECT * FROM matches WHERE id = ?1')
    this.selectEntries = db.prepare('SELECT idx, kind, actor, frame FROM match_log WHERE match_id = ?1 ORDER BY idx')
    this.selectSummaries = db.prepare(
      `SELECT m.id, m.created_at, m.winner, m.ended_at, m.account_0, a0.display_name AS name_0, a1.display_name AS name_1
        FROM matches m
        LEFT JOIN accounts a0 ON a0.id = m.account_0
        LEFT JOIN accounts a1 ON a1.id = m.account_1
        WHERE m.account_0 = ?1 OR m.account_1 = ?1
        ORDER BY m.created_at DESC
        LIMIT ?2`
    )
  }

  begin(header: MatchHeader): void {
    this.insertMatch.run(
      header.id,
      header.createdAt,
      header.rulesVersion,
      header.contentSchemaVersion,
      header.seed,
      header.heroes[0],
      header.heroes[1],
      JSON.stringify(header.decks[0]),
      JSON.stringify(header.decks[1]),
      header.accounts[0],
      header.accounts[1],
      header.mode
    )
  }

  append(matchId: string, firstIndex: number, entries: readonly InputEntry[], outcome: MatchOutcome | null): void {
    withTransaction(this.db, () => {
      const row = this.nextIndex.get(matchId) as { next: number } | null
      const expected = row?.next ?? 0
      if (expected !== firstIndex) throw new Error(`log gap for match ${matchId}: expected index ${expected}, got ${firstIndex}`)
      entries.forEach((entry, offset) => {
        if (entry.kind === 'timeout') this.insertEntry.run(matchId, firstIndex + offset, 'timeout', null, null)
        else this.insertEntry.run(matchId, firstIndex + offset, 'command', entry.actor, encodeCommandFrame(0, entry.commandId, entry.command))
      })
      if (outcome !== null) this.finishMatch.run(outcome.winner, outcome.endedAt, matchId)
    })
  }

  load(matchId: string): StoredMatch | null {
    const row = this.selectMatch.get(matchId) as MatchRow | null
    if (row === null) return null
    const entries = (this.selectEntries.all(matchId) as EntryRow[]).map((entry, position): InputEntry => {
      if (entry.idx !== position) throw new Error(`corrupt log for match ${matchId}: gap at index ${position}`)
      if (entry.kind === 'timeout') return { kind: 'timeout' }
      if (entry.kind !== 'command' || entry.frame === null) throw new Error(`corrupt log row ${entry.idx} for match ${matchId}`)
      const decoded = decodeCommandFrame(entry.frame)
      return { kind: 'command', actor: toPlayer(entry.actor), commandId: decoded.commandId, command: decoded.command }
    })
    return {
      header: {
        id: row.id,
        createdAt: row.created_at,
        rulesVersion: row.rules_version,
        contentSchemaVersion: row.content_schema_version,
        seed: row.seed,
        heroes: [row.hero_0, row.hero_1],
        decks: [parseDeck(row.deck_0), parseDeck(row.deck_1)],
        accounts: [row.account_0, row.account_1],
        mode: toMode(row.mode),
      },
      outcome: row.winner === null || row.ended_at === null ? null : { winner: toPlayer(row.winner), endedAt: row.ended_at },
      entries
    }
  }

  listForAccount(accountId: string, limit: number): MatchSummary[] {
    return (this.selectSummaries.all(accountId, limit) as SummaryRow[]).map((row): MatchSummary => {
      const seat: PlayerIndex = row.account_0 === accountId ? 0 : 1
      const opponent = (seat === 0 ? row.name_1 : row.name_0) ?? 'Former player'
      const result = row.winner === null ? 'unfinished' : row.winner === seat ? 'win' : 'loss'
      return { id: row.id, createdAt: row.created_at, endedAt: row.ended_at, seat, opponent, result }
    })
  }
}