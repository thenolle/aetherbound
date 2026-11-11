import { migrate, openDatabase } from '../persistence/database'
import { MIGRATIONS } from '../persistence/migrations'
import { SeasonStore } from '../persistence/season-store'

const path = process.env.DATABASE_PATH ?? 'data/aetherbound.db'
const database = openDatabase(path)
migrate(database, MIGRATIONS)
const result = new SeasonStore(database, () => Date.now()).closeSeason()
console.log(`closed ${result.closed.name}: archived ${result.archived} placed players, started ${result.next.name}`)
database.close()