import { EXCHEQUER_DECK, EXCHEQUER_HERO } from '../content/exchequer'
import { REWARD_RULES } from '../content/economy'
import { GoogleOidc } from '../auth/google'
import { SqliteAccountStore } from '../persistence/account-store'
import { migrate, openDatabase } from '../persistence/database'
import { EconomyStore } from '../persistence/economy-store'
import { HistoryService } from '../persistence/history'
import { SqliteMatchStore } from '../persistence/match-store'
import { MIGRATIONS } from '../persistence/migrations'
import { SqliteRatingStore } from '../persistence/rating-store'
import { ConfigError, loadConfig } from '../shared/config'
import { createLogger } from '../shared/log'
import { Auth } from './auth'
import { DeckService } from './decks'
import { devContent } from './dev-match'
import { createGameServer } from './gateway'
import { Matchmaker } from './matchmaker'
import { makeRewardHook } from './rewards'
import { RoomRegistry } from './rooms'
import { IntegrityStore } from '../persistence/integrity-store'
import { SeasonStore } from '../persistence/season-store'
import type { Metric } from './metrics'

try {
  const config = loadConfig(process.env)
  const log = createLogger(config.logLevel, { region: config.region })
  if (config.env === 'production' && !config.publicOrigin.startsWith('https://')) throw new ConfigError(['PUBLIC_ORIGIN must be https in production'])
  const database = openDatabase(config.databasePath)
  migrate(database, MIGRATIONS)
  const accounts = new SqliteAccountStore(database, () => Date.now())
  const matchStore = new SqliteMatchStore(database)
  const economy = new EconomyStore(database, () => Date.now())
  const decks = new DeckService(economy, devContent, { hero: EXCHEQUER_HERO, deck: EXCHEQUER_DECK })
  const ratings = new SqliteRatingStore(database, () => Date.now())
  const integrity = new IntegrityStore(database, () => Date.now())
  const seasons = new SeasonStore(database, () => Date.now())
  seasons.current()
  const repaired = ratings.reconcile()
  if (repaired > 0) log.info('applied ranked results missed before the last shutdown', { count: repaired })
  const rooms = new RoomRegistry(matchStore, (matchId, winnerId, loserId) => {
    ratings.applyResult(matchId, winnerId, loserId)
    integrity.inspect(matchId)
  }, makeRewardHook(economy, REWARD_RULES, () => Date.now()))
  const matchmaker = new Matchmaker(rooms, (pair) => decks.setupFor(pair), () => Date.now(), { ratingOf: (id) => ratings.get(id).mmr })
  const history = new HistoryService(matchStore, devContent)
  const google = config.googleClientId !== null && config.googleClientSecret !== null ? new GoogleOidc({ clientId: config.googleClientId, clientSecret: config.googleClientSecret, redirectUri: `${config.publicOrigin}/auth/google/callback` }) : null
  if (google === null) log.warn('google sign-in is not configured: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET')
  const auth = new Auth({ google, accounts, publicOrigin: config.publicOrigin, onAccountDeleted: (accountId) => matchmaker.leave(accountId) })
  const databaseHealthy = (): boolean => {
    try {
      database.query('SELECT 1').get()
      return true
    } catch {
      return false
    }
  }
  const metrics = (): Metric[] => {
    const stats = rooms.stats()
    const queue = matchmaker.queueSizes()
    const page = (database.query('PRAGMA page_count').get() as { page_count: number }).page_count
    const size = (database.query('PRAGMA page_size').get() as { page_size: number }).page_size
    return [
      { name: 'aetherbound_rooms_open', help: 'Rooms held in memory.', type: 'gauge', value: stats.rooms },
      { name: 'aetherbound_rooms_live', help: 'Rooms with a match in progress.', type: 'gauge', value: stats.live },
      { name: 'aetherbound_connected_seats', help: 'Seats with a live connection.', type: 'gauge', value: stats.seats },
      { name: 'aetherbound_matches_finished_total', help: 'Matches finished since start.', type: 'counter', value: stats.finished },
      { name: 'aetherbound_queue_waiting', help: 'Players waiting in a queue.', type: 'gauge', value: queue.casual, labels: { mode: 'casual' } },
      { name: 'aetherbound_queue_waiting', help: 'Players waiting in a queue.', type: 'gauge', value: queue.ranked, labels: { mode: 'ranked' } },
      { name: 'aetherbound_database_bytes', help: 'Size of the database file.', type: 'gauge', value: page * size },
      { name: 'aetherbound_process_resident_bytes', help: 'Resident memory of the process.', type: 'gauge', value: process.memoryUsage().rss },
      { name: 'aetherbound_process_uptime_seconds', help: 'Seconds since the process started.', type: 'gauge', value: process.uptime() }
    ]
  }
  let ready = true
  const server = createGameServer(config, () => ready && databaseHealthy(), rooms, auth, { matchmaker, history, ratings, economy: { economy, decks, content: devContent, now: () => Date.now() }, seasons, integrity, metrics })
  const sweeper = setInterval(() => {
    accounts.sweepExpired()
    matchmaker.sweep()
    ratings.reconcile()
  }, 60_000)
  sweeper.unref()
  const ticker = setInterval(() => matchmaker.tick(), 1000)
  ticker.unref()
  log.info('server started', { url: server.url.toString(), env: config.env, database: config.databasePath, origin: config.publicOrigin })
  const shutdown = async (signal: string): Promise<void> => {
    log.info('shutdown requested', { signal })
    ready = false
    clearInterval(sweeper)
    clearInterval(ticker)
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