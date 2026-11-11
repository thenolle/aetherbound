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
  },
  {
    version: 3,
    name: 'link matches to accounts',
    sql: `
ALTER TABLE matches ADD COLUMN account_0 TEXT REFERENCES accounts (id) ON DELETE SET NULL;
ALTER TABLE matches ADD COLUMN account_1 TEXT REFERENCES accounts (id) ON DELETE SET NULL;
CREATE INDEX matches_account_0 ON matches (account_0, created_at);
CREATE INDEX matches_account_1 ON matches (account_1, created_at);
`
  },
  {
    version: 4,
    name: 'collection, wallets, decks, pack openings and ratings',
    sql: `
CREATE TABLE collection (
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  copies INTEGER NOT NULL CHECK (copies > 0),
  PRIMARY KEY (account_id, card_id)
) WITHOUT ROWID;
CREATE TABLE grants (
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  grant_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, grant_key)
) WITHOUT ROWID;
CREATE TABLE wallets (
  account_id TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  packs INTEGER NOT NULL DEFAULT 0 CHECK (packs >= 0),
  dust INTEGER NOT NULL DEFAULT 0 CHECK (dust >= 0)
);
CREATE TABLE decks (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hero_id TEXT NOT NULL,
  cards TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX decks_account ON decks (account_id);
ALTER TABLE accounts ADD COLUMN active_deck_id TEXT;
CREATE TABLE pack_openings (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  table_version INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  cards TEXT NOT NULL,
  dust_gained INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX pack_openings_account ON pack_openings (account_id, created_at);
CREATE TABLE ratings (
  account_id TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  mmr REAL NOT NULL,
  games INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE rating_updates (
  match_id TEXT PRIMARY KEY REFERENCES matches (id) ON DELETE CASCADE,
  winner_id TEXT NOT NULL,
  loser_id TEXT NOT NULL,
  winner_before REAL NOT NULL,
  winner_after REAL NOT NULL,
  loser_before REAL NOT NULL,
  loser_after REAL NOT NULL,
  created_at INTEGER NOT NULL
);
`
  },
  {
    version: 5,
    name: 'match mode',
    sql: `
ALTER TABLE matches ADD COLUMN mode TEXT NOT NULL DEFAULT 'casual' CHECK (mode IN ('casual', 'ranked'));
CREATE INDEX matches_ranked_pending ON matches (mode, ended_at);
`
  },
  {
    version: 6,
    name: 'economy log and match rewards',
    sql: `
CREATE TABLE economy_log (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX economy_log_account ON economy_log (account_id, created_at);
CREATE TABLE match_rewards (
  match_id TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  opponent_id TEXT NOT NULL,
  packs INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (match_id, account_id)
) WITHOUT ROWID;
CREATE INDEX match_rewards_day ON match_rewards (account_id, day);
`
  },
  {
    version: 7,
    name: 'seasons and integrity flags',
    sql: `
CREATE TABLE seasons (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE TABLE season_results (
  season_id INTEGER NOT NULL REFERENCES seasons (id),
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  final_mmr REAL NOT NULL,
  games INTEGER NOT NULL,
  league TEXT NOT NULL,
  division INTEGER NOT NULL,
  PRIMARY KEY (season_id, account_id)
) WITHOUT ROWID;
CREATE TABLE integrity_flags (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  UNIQUE (match_id, kind)
);
CREATE INDEX integrity_flags_open ON integrity_flags (reviewed_at, created_at);
`
  },
]