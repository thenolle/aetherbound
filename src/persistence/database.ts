import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Migration } from './migrations'

export type DurabilityMode = 'full' | 'normal'

export type OpenOptions = Readonly<{ durability?: DurabilityMode }>

export function openDatabase(path: string, options: OpenOptions = {}): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path, { strict: true })
  db.run('PRAGMA journal_mode = WAL')
  db.run(`PRAGMA synchronous = ${(options.durability ?? 'full').toUpperCase()}`)
  db.run('PRAGMA foreign_keys = ON')
  db.run('PRAGMA busy_timeout = 5000')
  return db
}

export function withTransaction<T>(db: Database, work: () => T): T {
  db.run('BEGIN IMMEDIATE')
  try {
    const result = work()
    db.run('COMMIT')
    return result
  } catch (error) {
    db.run('ROLLBACK')
    throw error
  }
}

export function migrate(db: Database, migrations: readonly Migration[]): number {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) throw new Error(`migration versions must be contiguous from 1 (found ${migration.version} at position ${index + 1})`)
  })
  const row = db.query('PRAGMA user_version').get() as { user_version: number } | null
  const current = row?.user_version ?? 0
  if (current > migrations.length) {
    throw new Error(`database schema version ${current} is newer than this build supports (${migrations.length})`)
  }
  for (const migration of migrations.slice(current)) {
    withTransaction(db, () => {
      db.run(migration.sql)
      db.run(`PRAGMA user_version = ${migration.version}`)
    })
  }
  return migrations.length
}