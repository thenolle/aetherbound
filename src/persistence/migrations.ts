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
  }
]