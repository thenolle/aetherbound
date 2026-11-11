import { checkDatabase } from '../persistence/backup'
import { openDatabase } from '../persistence/database'

const path = process.env.DATABASE_PATH ?? 'data/aetherbound.db'
const database = openDatabase(path)
const report = checkDatabase(database)
database.close()
console.log(JSON.stringify(report, null, 2))
if (report.integrity !== 'ok' || report.foreignKeyProblems > 0) process.exit(1)