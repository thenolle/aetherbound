import type { MatchSummary, SqliteMatchStore } from './match-store'
import { buildReplay } from './restore'
import type { ContentLookup, ReplayStep } from './restore'

const HISTORY_LIMIT = 50

export class HistoryService {
  private readonly store: SqliteMatchStore
  private readonly content: ContentLookup

  constructor(store: SqliteMatchStore, content: ContentLookup) {
    this.store = store
    this.content = content
  }

  list(accountId: string): MatchSummary[] {
    return this.store.listForAccount(accountId, HISTORY_LIMIT)
  }

  replay(accountId: string, matchId: string): ReplayStep[] | null {
    const stored = this.store.load(matchId)
    if (stored === null) return null
    const seat = stored.header.accounts[0] === accountId ? 0 : stored.header.accounts[1] === accountId ? 1 : null
    return seat === null ? null : buildReplay(stored, this.content, seat)
  }
}