import { migrate, openDatabase } from '../persistence/database'
import { SqliteMatchStore } from '../persistence/match-store'
import { MIGRATIONS } from '../persistence/migrations'
import { ConfigError, loadConfig } from '../shared/config'
import { createLogger } from '../shared/log'
import { createGameServer } from './gateway'
import { RoomRegistry } from './rooms'

try {
  const config = loadConfig(process.env)
  const log = createLogger(config.logLevel, { region: config.region })
  const database = openDatabase(config.databasePath)
  migrate(database, MIGRATIONS)
  const rooms = new RoomRegistry(new SqliteMatchStore(database))
  let ready = true
  const server = createGameServer(config, () => ready, rooms)
  log.info('server started', { url: server.url.toString(), env: config.env, database: config.databasePath })

  const shutdown = async (signal: string): Promise<void> => {
    log.info('shutdown requested', { signal })
    ready = false
    rooms.closeAll()
    await server.stop()
    database.close()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message)
    process.exit(1)
  }
  throw error
}