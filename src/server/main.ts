import { ConfigError, loadConfig } from '../shared/config'
import { createLogger } from '../shared/log'
import { createGameServer } from './gateway'
import { RoomRegistry } from './rooms'

try {
  const config = loadConfig(process.env)
  const log = createLogger(config.logLevel, { region: config.region })
  const rooms = new RoomRegistry()
  let ready = true
  const server = createGameServer(config, () => ready, rooms)
  log.info('server started', { url: server.url.toString(), env: config.env })

  const shutdown = async (signal: string): Promise<void> => {
    log.info('shutdown requested', { signal })
    ready = false
    rooms.closeAll()
    await server.stop()
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