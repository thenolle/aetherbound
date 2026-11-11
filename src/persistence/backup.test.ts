import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backupDatabase, backupName, checkDatabase, rotateBackups } from './backup'
import { migrate, openDatabase } from './database'
import { MIGRATIONS } from './migrations'

let dir: string
let db: ReturnType<typeof openDatabase>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aetherbound-backup-'))
  db = openDatabase(join(dir, 'live', 'game.db'))
  migrate(db, MIGRATIONS)
  db.run("INSERT INTO accounts (id, google_sub, display_name, created_at, last_login_at) VALUES ('a1', 'a', 'Alice', 1, 1), ('b1', 'b', 'Bob', 1, 1)")
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

describe('backups', () => {
  test('a backup is a verified, consistent copy of the live database', () => {
    const result = backupDatabase(db, join(dir, 'out', backupName(Date.UTC(2026, 10, 11, 21, 46, 0))))
    expect(result.path.endsWith('aetherbound-20261111T214600Z.db')).toBe(true)
    expect(result).toMatchObject({ integrity: 'ok', foreignKeyProblems: 0, schemaVersion: MIGRATIONS.length })
    expect(result.rows.accounts).toBe(2)
    expect(result.bytes).toBeGreaterThan(0)
    expect(checkDatabase(db)).toMatchObject({ integrity: 'ok', foreignKeyProblems: 0 })
  })

  test('an existing backup is never overwritten', () => {
    const target = join(dir, 'out', 'aetherbound-20261111T000000Z.db')
    backupDatabase(db, target)
    expect(() => backupDatabase(db, target)).toThrow('refusing to overwrite')
  })

  test('rotation keeps the newest backups and ignores other files', () => {
    const out = join(dir, 'out')
    backupDatabase(db, join(out, 'aetherbound-20261101T000000Z.db'))
    backupDatabase(db, join(out, 'aetherbound-20261102T000000Z.db'))
    backupDatabase(db, join(out, 'aetherbound-20261103T000000Z.db'))
    writeFileSync(join(out, 'notes.txt'), 'keep me')
    expect(rotateBackups(out, 2)).toEqual(['aetherbound-20261101T000000Z.db'])
    expect(readdirSync(out).sort()).toEqual(['aetherbound-20261102T000000Z.db', 'aetherbound-20261103T000000Z.db', 'notes.txt'])
  })
})