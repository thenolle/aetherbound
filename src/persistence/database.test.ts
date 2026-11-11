import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate, openDatabase, withTransaction } from './database'
import { MIGRATIONS } from './migrations'

const tables = (db: ReturnType<typeof openDatabase>): string[] =>
  (db.query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map((row) => row.name)

describe('migrate', () => {
  test('applies every migration and records the schema version', () => {
    const db = openDatabase(':memory:')
    expect(migrate(db, MIGRATIONS)).toBe(MIGRATIONS.length)
    expect(tables(db)).toEqual(expect.arrayContaining(['match_log', 'matches']))
    expect(db.query('PRAGMA user_version').get()).toEqual({ user_version: MIGRATIONS.length })
    db.close()
  })

  test('is idempotent', () => {
    const db = openDatabase(':memory:')
    migrate(db, MIGRATIONS)
    expect(() => migrate(db, MIGRATIONS)).not.toThrow()
    db.close()
  })

  test('refuses a database from a newer build', () => {
    const db = openDatabase(':memory:')
    db.run(`PRAGMA user_version = ${MIGRATIONS.length + 1}`)
    expect(() => migrate(db, MIGRATIONS)).toThrow('newer')
    db.close()
  })

  test('rejects non-contiguous migration versions', () => {
    const db = openDatabase(':memory:')
    expect(() => migrate(db, [{ version: 2, name: 'gap', sql: 'SELECT 1' }])).toThrow('contiguous')
    db.close()
  })
})

describe('database', () => {
  test('withTransaction commits on success and rolls back on error', () => {
    const db = openDatabase(':memory:')
    db.run('CREATE TABLE t (n INTEGER)')
    withTransaction(db, () => db.run('INSERT INTO t VALUES (1)'))
    expect(() => withTransaction(db, () => {
      db.run('INSERT INTO t VALUES (2)')
      throw new Error('boom')
    })).toThrow('boom')
    expect(db.query('SELECT n FROM t').all()).toEqual([{ n: 1 }])
    db.close()
  })

  test('a file database gets its folder, WAL mode and foreign keys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aetherbound-'))
    const db = openDatabase(join(dir, 'nested', 'test.db'))
    expect(db.query('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' })
    expect(db.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })
})