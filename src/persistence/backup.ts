import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type BackupResult = Readonly<{
  path: string
  bytes: number
  integrity: string
  foreignKeyProblems: number
  schemaVersion: number
  rows: Readonly<Record<string, number>>
}>

const COUNTED_TABLES = ['accounts', 'matches', 'match_log', 'collection', 'ratings'] as const
const BACKUP_PATTERN = /^aetherbound-\d{8}T\d{6}Z\.db$/

export function backupName(now: number): string {
  const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return `aetherbound-${stamp}.db`
}

export function checkDatabase(db: Database): Pick<BackupResult, 'integrity' | 'foreignKeyProblems' | 'schemaVersion' | 'rows'> {
  const integrityRows = db.query('PRAGMA integrity_check').all() as { integrity_check: string }[]
  const integrity = integrityRows.map((row) => row.integrity_check).join('; ')
  const foreignKeyProblems = (db.query('PRAGMA foreign_key_check').all() as unknown[]).length
  const schemaVersion = (db.query('PRAGMA user_version').get() as { user_version: number }).user_version
  const rows: Record<string, number> = {}
  for (const table of COUNTED_TABLES) {
    const found = db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?1").get(table)
    if (found !== null) rows[table] = (db.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
  }
  return { integrity, foreignKeyProblems, schemaVersion, rows }
}

export function backupDatabase(db: Database, target: string): BackupResult {
  if (existsSync(target)) throw new Error(`refusing to overwrite ${target}`)
  mkdirSync(dirname(target), { recursive: true })
  db.prepare('VACUUM INTO ?1').run(target)
  const copy = new Database(target, { readonly: true })
  try { return { path: target, bytes: statSync(target).size, ...checkDatabase(copy) } } finally { copy.close() }
}

export function rotateBackups(dir: string, keep: number): string[] {
  const names = readdirSync(dir).filter((name) => BACKUP_PATTERN.test(name)).sort()
  const stale = names.slice(0, Math.max(0, names.length - keep))
  for (const name of stale) rmSync(join(dir, name))
  return stale
}