import type { HistoryService } from '../persistence/history'
import type { Auth } from './auth'
import type { Matchmaker } from './matchmaker'
import { empty, json, originAllowed } from './origin'
import { handleEconomy } from './economy-api'
import type { EconomyServices } from './economy-api'
import type { SqliteRatingStore } from '../persistence/rating-store'
import type { IntegrityStore } from '../persistence/integrity-store'
import type { SeasonStore } from '../persistence/season-store'
import type { Metric } from './metrics'

export type ApiServices = Readonly<{
  matchmaker: Matchmaker
  history: HistoryService | null
  economy?: EconomyServices
  ratings?: SqliteRatingStore
  seasons?: SeasonStore
  integrity?: IntegrityStore
  metrics?: () => readonly Metric[]
}>

const REPLAY_PATH = /^\/api\/replay\/([0-9a-f-]{36})$/

export async function handleApi(request: Request, url: URL, auth: Auth, services: ApiServices): Promise<Response> {
  const account = auth.authenticate(request)
  if (account === null) return json({ error: 'unauthorized' }, 401)
  const mutating = request.method !== 'GET' && request.method !== 'HEAD'
  if (mutating && !originAllowed(request, url)) return json({ error: 'forbidden_origin' }, 403)
  const route = `${request.method} ${url.pathname}`
  if (route === 'POST /api/queue/join') {
    const mode = url.searchParams.get('mode') ?? 'casual'
    if (mode !== 'casual' && mode !== 'ranked') return json({ error: 'bad_request' }, 400)
    return json(services.matchmaker.join(account.id, mode), 200)
  }
  if (route === 'GET /api/rank' && services.ratings !== undefined) return json(services.ratings.rankFor(account.id), 200)
  if (route === 'GET /api/leaderboard' && services.seasons !== undefined) return json({ season: services.seasons.current(), entries: services.seasons.leaderboard(50) }, 200)
  if (url.pathname.startsWith('/api/admin/')) {
    if (account.role !== 'admin' || services.integrity === undefined) return json({ error: 'not_found' }, 404)
    if (route === 'GET /api/admin/flags') return json({ flags: services.integrity.openFlags(100) }, 200)
    if (route === 'POST /api/admin/flags/review') return services.integrity.review(url.searchParams.get('id') ?? '') ? empty(204) : json({ error: 'not_found' }, 404)
    return json({ error: 'not_found' }, 404)
  }
  if (route === 'GET /api/queue/status') return json(services.matchmaker.status(account.id), 200)
  if (route === 'POST /api/queue/leave') {
    services.matchmaker.leave(account.id)
    return empty(204)
  }
  if (services.history !== null) {
    if (route === 'GET /api/history') return json({ matches: services.history.list(account.id) }, 200)
    const replay = REPLAY_PATH.exec(url.pathname)
    if (request.method === 'GET' && replay?.[1] !== undefined) {
      const steps = services.history.replay(account.id, replay[1])
      return steps === null ? json({ error: 'not_found' }, 404) : json({ steps }, 200)
    }
  }
  if (services.economy !== undefined) {
    const response = await handleEconomy(request, url, account, services.economy)
    if (response !== null) return response
  }
  return json({ error: 'not_found' }, 404)
}