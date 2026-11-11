import { ConfigError, loadConfig } from '../shared/config'
import { createLogger } from '../shared/log'
import { createServer } from './http'

try {
  const config = loadConfig(process.env)
  const log = createLogger(config.logLevel, { region: config.region })
  let ready = true
  const server = createServer(config, () => ready)
  log.info('server started', { url: server.url.toString(), env: config.env })
  const shutdown = async (signal: string): Promise<void> => {
    log.info('shutdown requested', { signal })
    ready = false
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