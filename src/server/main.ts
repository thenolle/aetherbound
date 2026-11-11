import { GoogleOidc } from '../auth/google'
import { SqliteAccountStore } from '../persistence/account-store'
import { migrate, openDatabase } from '../persistence/database'
import { HistoryService } from '../persistence/history'
import { SqliteMatchStore } from '../persistence/match-store'
import { MIGRATIONS } from '../persistence/migrations'
import { ConfigError, loadConfig } from '../shared/config'
import { createLogger } from '../shared/log'
import { Auth } from './auth'
import { devContent } from './dev-match'
import { createGameServer } from './gateway'
import { Matchmaker } from './matchmaker'
import { RoomRegistry } from './rooms'
import { EXCHEQUER_DECK, EXCHEQUER_HERO } from '../content/exchequer'
import { EconomyStore } from '../persistence/economy-store'
import { DeckService } from './decks'
import { SqliteRatingStore } from '../persistence/rating-store'

try {
  const config = loadConfig(process.env)
  const log = createLogger(config.logLevel, { region: config.region })
  if (config.env === 'production' && !config.publicOrigin.startsWith('https://')) throw new ConfigError(['PUBLIC_ORIGIN must be https in production'])
  const database = openDatabase(config.databasePath)
  migrate(database, MIGRATIONS)
  const accounts = new SqliteAccountStore(database, () => Date.now())
  const matchStore = new SqliteMatchStore(database)
  const ratings = new SqliteRatingStore(database, () => Date.now())
  const repaired = ratings.reconcile()
  if (repaired > 0) log.info('applied ranked results missed before the last shutdown', { count: repaired })
  const rooms = new RoomRegistry(matchStore, (matchId, winnerId, loserId) => { ratings.applyResult(matchId, winnerId, loserId) })
  const economy = new EconomyStore(database, () => Date.now())
  const decks = new DeckService(economy, devContent, { hero: EXCHEQUER_HERO, deck: EXCHEQUER_DECK })
  const matchmaker = new Matchmaker(rooms, (pair) => decks.setupFor(pair), () => Date.now(), { ratingOf: (id) => ratings.get(id).mmr })
  const history = new HistoryService(matchStore, devContent)
  const google = config.googleClientId !== null && config.googleClientSecret !== null ? new GoogleOidc({ clientId: config.googleClientId, clientSecret: config.googleClientSecret, redirectUri: `${config.publicOrigin}/auth/google/callback` }) : null
  if (google === null) log.warn('google sign-in is not configured: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET')
  const auth = new Auth({ google, accounts, publicOrigin: config.publicOrigin, onAccountDeleted: (accountId) => matchmaker.leave(accountId) })
  let ready = true
  const server = createGameServer(config, () => ready, rooms, auth, { matchmaker, history, economy: { economy, decks, content: devContent, now: () => Date.now() }, ratings })
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