import { checkDatabase } from '../persistence/backup'
import { openDatabase } from '../persistence/database'
import { MIGRATIONS } from '../persistence/migrations'

const path = process.env.DATABASE_PATH ?? 'data/aetherbound.db'
const database = openDatabase(path)
const report = checkDatabase(database)
database.close()
console.log(JSON.stringify(report, null, 2))
if (report.schemaVersion < MIGRATIONS.length) console.log(`note: schema ${report.schemaVersion} of ${MIGRATIONS.length}; the server migrates it on start`)
if (report.integrity !== 'ok' || report.foreignKeyProblems > 0) process.exit(1)