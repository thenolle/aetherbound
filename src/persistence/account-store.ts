import type { Database } from 'bun:sqlite'
import { hashToken, randomToken } from '../auth/tokens'
import { withTransaction } from './database'

type Prepared = ReturnType<Database['prepare']>

export type AccountRole = 'player' | 'moderator' | 'admin'

export type Account = Readonly<{ id: string, displayName: string, role: AccountRole }>

export type AuthFlow = Readonly<{ state: string, nonce: string, codeVerifier: string }>

export type NewSession = Readonly<{ token: string, expiresAt: number }>

type AccountRow = { id: string, display_name: string, role: string }

type FlowRow = { state: string, nonce: string, code_verifier: string, expires_at: number }

const MAX_USER_AGENT = 200

function toRole(value: string): AccountRole {
  if (value === 'player' || value === 'moderator' || value === 'admin') return value
  throw new Error('corrupt role column')
}

const toAccount = (row: AccountRow): Account => ({ id: row.id, displayName: row.display_name, role: toRole(row.role) })

export type SessionInfo = Readonly<{
  id: string
  createdAt: number
  expiresAt: number
  userAgent: string | null
  current: boolean
}>

type SessionRow = { token_hash: string, created_at: number, expires_at: number, user_agent: string | null }

export class SqliteAccountStore {
  private readonly db: Database
  private readonly now: () => number
  private readonly selectBySub: Prepared
  private readonly insertAccount: Prepared
  private readonly touchAccount: Prepared
  private readonly insertSession: Prepared
  private readonly selectSession: Prepared
  private readonly deleteSession: Prepared
  private readonly deleteAccountSessions: Prepared
  private readonly insertFlow: Prepared
  private readonly selectFlow: Prepared
  private readonly deleteFlow: Prepared
  private readonly sweepSessions: Prepared
  private readonly sweepFlows: Prepared
  private readonly selectSessions: Prepared
  private readonly deleteSessionById: Prepared
  private readonly deleteAccountRow: Prepared
  private readonly anonymizeWinner: Prepared
  private readonly anonymizeLoser: Prepared
  private readonly anonymizeOpponent: Prepared

  constructor(db: Database, now: () => number) {
    this.db = db
    this.now = now
    this.selectBySub = db.prepare('SELECT id, display_name, role FROM accounts WHERE google_sub = ?1')
    this.insertAccount = db.prepare('INSERT INTO accounts (id, google_sub, display_name, created_at, last_login_at) VALUES (?1, ?2, ?3, ?4, ?4)')
    this.touchAccount = db.prepare('UPDATE accounts SET display_name = ?1, last_login_at = ?2 WHERE id = ?3')
    this.insertSession = db.prepare('INSERT INTO sessions (token_hash, account_id, created_at, expires_at, user_agent) VALUES (?1, ?2, ?3, ?4, ?5)')
    this.selectSession = db.prepare('SELECT a.id, a.display_name, a.role FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ?1 AND s.expires_at > ?2')
    this.deleteSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?1')
    this.deleteAccountSessions = db.prepare('DELETE FROM sessions WHERE account_id = ?1')
    this.insertFlow = db.prepare('INSERT INTO auth_flows (id_hash, state, nonce, code_verifier, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    this.selectFlow = db.prepare('SELECT state, nonce, code_verifier, expires_at FROM auth_flows WHERE id_hash = ?1')
    this.deleteFlow = db.prepare('DELETE FROM auth_flows WHERE id_hash = ?1')
    this.sweepSessions = db.prepare('DELETE FROM sessions WHERE expires_at <= ?1')
    this.sweepFlows = db.prepare('DELETE FROM auth_flows WHERE expires_at <= ?1')
    this.selectSessions = db.prepare('SELECT token_hash, created_at, expires_at, user_agent FROM sessions WHERE account_id = ?1 AND expires_at > ?2 ORDER BY created_at DESC')
    this.deleteSessionById = db.prepare('DELETE FROM sessions WHERE account_id = ?1 AND substr(token_hash, 1, 16) = ?2')
    this.deleteAccountRow = db.prepare('DELETE FROM accounts WHERE id = ?1')
    this.anonymizeWinner = db.prepare("UPDATE rating_updates SET winner_id = 'deleted' WHERE winner_id = ?1")
    this.anonymizeLoser = db.prepare("UPDATE rating_updates SET loser_id = 'deleted' WHERE loser_id = ?1")
    this.anonymizeOpponent = db.prepare("UPDATE match_rewards SET opponent_id = 'deleted' WHERE opponent_id = ?1")
  }

  upsertGoogleAccount(sub: string, displayName: string): Account {
    return withTransaction(this.db, () => {
      const now = this.now()
      const row = this.selectBySub.get(sub) as AccountRow | null
      if (row === null) {
        const id = crypto.randomUUID()
        this.insertAccount.run(id, sub, displayName, now)
        return { id, displayName, role: 'player' }
      }
      this.touchAccount.run(displayName, now, row.id)
      return { ...toAccount(row), displayName }
    })
  }

  createSession(accountId: string, userAgent: string | null, ttlMs: number): NewSession {
    const token = randomToken()
    const now = this.now()
    const expiresAt = now + ttlMs
    this.insertSession.run(hashToken(token), accountId, now, expiresAt, userAgent === null ? null : userAgent.slice(0, MAX_USER_AGENT))
    return { token, expiresAt }
  }

  resolveSession(token: string): Account | null {
    const row = this.selectSession.get(hashToken(token), this.now()) as AccountRow | null
    return row === null ? null : toAccount(row)
  }

  revokeSession(token: string): void {
    this.deleteSession.run(hashToken(token))
  }

  revokeAllSessions(accountId: string): number {
    return this.deleteAccountSessions.run(accountId).changes
  }

  saveFlow(flowId: string, flow: AuthFlow, ttlMs: number): void {
    this.insertFlow.run(hashToken(flowId), flow.state, flow.nonce, flow.codeVerifier, this.now() + ttlMs)
  }

  takeFlow(flowId: string): AuthFlow | null {
    return withTransaction(this.db, () => {
      const key = hashToken(flowId)
      const row = this.selectFlow.get(key) as FlowRow | null
      this.deleteFlow.run(key)
      if (row === null || row.expires_at <= this.now()) return null
      return { state: row.state, nonce: row.nonce, codeVerifier: row.code_verifier }
    })
  }

  sweepExpired(): number {
    const now = this.now()
    return this.sweepSessions.run(now).changes + this.sweepFlows.run(now).changes
  }

  listSessions(accountId: string, currentToken: string | null): SessionInfo[] {
    const currentHash = currentToken === null ? null : hashToken(currentToken)
    return (this.selectSessions.all(accountId, this.now()) as SessionRow[]).map((row) => ({
      id: row.token_hash.slice(0, 16),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      userAgent: row.user_agent,
      current: row.token_hash === currentHash
    }))
  }

  revokeSessionById(accountId: string, publicId: string): boolean {
    return this.deleteSessionById.run(accountId, publicId).changes > 0
  }

  deleteAccount(accountId: string): void {
    withTransaction(this.db, () => {
      this.anonymizeWinner.run(accountId)
      this.anonymizeLoser.run(accountId)
      this.anonymizeOpponent.run(accountId)
      this.deleteAccountRow.run(accountId)
    })
  }
}