import { backupDatabase, backupName, rotateBackups } from '../persistence/backup'
import { openDatabase } from '../persistence/database'

const path = process.env.DATABASE_PATH ?? 'data/aetherbound.db'
const dir = process.env.BACKUP_DIR ?? 'backups'
const keep = Number(process.env.BACKUP_KEEP ?? '14')

const database = openDatabase(path)
const result = backupDatabase(database, `${dir}/${backupName(Date.now())}`)
database.close()

const healthy = result.integrity === 'ok' && result.foreignKeyProblems === 0
console.log(`backup ${result.path}: ${result.bytes} bytes, schema ${result.schemaVersion}, integrity ${result.integrity}, rows ${JSON.stringify(result.rows)}`)
if (!healthy) {
  console.error('the backup did not verify: keeping it for inspection and skipping rotation')
  process.exit(1)
}
const removed = rotateBackups(dir, Number.isInteger(keep) && keep > 0 ? keep : 14)
if (removed.length > 0) console.log(`rotated away ${removed.length} old backup(s)`)