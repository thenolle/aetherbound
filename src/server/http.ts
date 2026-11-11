import type { AppConfig } from '../shared/config'

export type Readiness = () => boolean

const BASE_HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
} as const

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: BASE_HEADERS })
}

export function handleRequest(request: Request, config: AppConfig, isReady: Readiness): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') return jsonResponse({ error: 'method_not_allowed' }, 405)
  const { pathname } = new URL(request.url)
  if (pathname === '/healthz') return jsonResponse({ status: 'ok', region: config.region }, 200)
  if (pathname === '/readyz') {
    const ready = isReady()
    return jsonResponse({ status: ready ? 'ready' : 'draining', region: config.region }, ready ? 200 : 503)
  }
  return jsonResponse({ error: 'not_found' }, 404)
}

export function createServer(config: AppConfig, isReady: Readiness) {
  return Bun.serve({
    hostname: config.host,
    port: config.port,
    fetch: (request) => handleRequest(request, config, isReady)
  })
}