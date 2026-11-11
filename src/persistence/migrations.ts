export type Migration = Readonly<{ version: number, name: string, sql: string }>

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'matches and match log',
    sql: `
CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  rules_version INTEGER NOT NULL,
  content_schema_version INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  hero_0 TEXT NOT NULL,
  hero_1 TEXT NOT NULL,
  deck_0 TEXT NOT NULL,
  deck_1 TEXT NOT NULL,
  winner INTEGER CHECK (winner IN (0, 1)),
  ended_at INTEGER
);
CREATE INDEX matches_ended_at ON matches (ended_at);
CREATE TABLE match_log (
  match_id TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('command', 'timeout')),
  actor INTEGER CHECK (actor IN (0, 1)),
  frame BLOB,
  PRIMARY KEY (match_id, idx),
  CHECK (
    (kind = 'command' AND actor IS NOT NULL AND frame IS NOT NULL) OR
    (kind = 'timeout' AND actor IS NULL AND frame IS NULL)
  )
) WITHOUT ROWID;
`
  },
  {
    version: 2,
    name: 'accounts, sessions and sign-in flows',
    sql: `
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'moderator', 'admin')),
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX sessions_account ON sessions (account_id);
CREATE INDEX sessions_expiry ON sessions (expires_at);
CREATE TABLE auth_flows (
  id_hash TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_flows_expiry ON auth_flows (expires_at);
`
  }
]