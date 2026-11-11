import type { HistoryService } from '../persistence/history'
import type { Auth } from './auth'
import type { Matchmaker } from './matchmaker'
import { empty, json, originAllowed } from './origin'

export type ApiServices = Readonly<{ matchmaker: Matchmaker, history: HistoryService | null }>

const REPLAY_PATH = /^\/api\/replay\/([0-9a-f-]{36})$/

export async function handleApi(request: Request, url: URL, auth: Auth, services: ApiServices): Promise<Response> {
  const account = auth.authenticate(request)
  if (account === null) return json({ error: 'unauthorized' }, 401)
  const mutating = request.method !== 'GET' && request.method !== 'HEAD'
  if (mutating && !originAllowed(request, url)) return json({ error: 'forbidden_origin' }, 403)

  const route = `${request.method} ${url.pathname}`
  if (route === 'POST /api/queue/join') return json(services.matchmaker.join(account.id), 200)
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
  return json({ error: 'not_found' }, 404)
}