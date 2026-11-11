import type { PlayerIndex } from '../rules/types'
import type { AppConfig } from '../shared/config'
import type { Auth } from './auth'
import { buildClientBundle } from './client-bundle'
import { devMatchSetup } from './dev-match'
import { handleRequest } from './http'
import type { Readiness } from './http'
import type { Room, SeatLink } from './room'
import type { RoomRegistry } from './rooms'
import { SCRIPT_HEADERS, SHELL_HEADERS, renderShell } from './shell'
import { handleApi } from './api'
import type { ApiServices } from './api'
import { json, originAllowed } from './origin'

export type SocketData = {
  seat: PlayerIndex
  room: Room
  link: SeatLink | null
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const NAME_PATTERN = /^[a-z0-9-]{1,32}$/

export function createGameServer(config: AppConfig, isReady: Readiness, rooms: RoomRegistry, auth: Auth, services: ApiServices) {
  let bundle: Promise<string> | null = null
  const clientBundle = (): Promise<string> => {
    bundle ??= buildClientBundle().catch((error: unknown) => {
      bundle = null
      throw error
    })
    return bundle
  }
  return Bun.serve({
    hostname: config.host,
    port: config.port,
    async fetch(request, server) {
      const url = new URL(request.url)
      const readOnly = request.method === 'GET' || request.method === 'HEAD'
      if (url.pathname === '/ws') {
        if (!originAllowed(request, url)) return json({ error: 'forbidden_origin' }, 403)
        const binding = rooms.lookup(url.searchParams.get('token') ?? '')
        const account = auth.authenticate(request)
        if (binding === null || binding.accountId === null || account === null || account.id !== binding.accountId) return json({ error: 'unauthorized' }, 401)
        const data: SocketData = { seat: binding.seat, room: binding.room, link: null }
        if (server.upgrade(request, { data })) return undefined
        return json({ error: 'upgrade_failed' }, 400)
      }
      if (url.pathname.startsWith('/auth/')) return auth.handle(request)
      if (url.pathname.startsWith('/api/')) return handleApi(request, url, auth, services)
      if (readOnly && url.pathname === '/') return new Response(renderShell(), { headers: SHELL_HEADERS })
      if (readOnly && url.pathname === '/client.js') {
        try {
          return new Response(await clientBundle(), { headers: SCRIPT_HEADERS })
        } catch (error) {
          console.error(error)
          return json({ error: 'client_build_failed' }, 500)
        }
      }
      if (request.method === 'POST' && url.pathname === '/dev/join') {
        const address = server.requestIP(request)?.address ?? ''
        if (config.env === 'production' || !LOOPBACK.has(address)) return json({ error: 'not_found' }, 404)
        if (!originAllowed(request, url)) return json({ error: 'forbidden_origin' }, 403)
        const account = auth.authenticate(request)
        if (account === null) return json({ error: 'unauthorized' }, 401)
        const name = url.searchParams.get('room') ?? 'dev'
        if (!NAME_PATTERN.test(name)) return json({ error: 'bad_request' }, 400)
        const joined = rooms.joinNamed(name, account.id, devMatchSetup)
        if (joined === null) return json({ error: 'room_full' }, 409)
        return json({ seat: joined.seat, token: joined.token }, 200)
      }
      return handleRequest(request, config, isReady)
    },
    websocket: {
      data: {} as SocketData,
      maxPayloadLength: 1024,
      idleTimeout: 120,
      open(ws) {
        const link: SeatLink = {
          send: (data) => {
            if (ws.send(data) === 0) ws.close(1013, 'client too slow')
          },
          close: (code, reason) => ws.close(code, reason)
        }
        ws.data.link = link
        ws.data.room.attach(ws.data.seat, link)
      },
      message(ws, message) {
        const link = ws.data.link
        if (link === null || typeof message === 'string') {
          ws.close(1003, 'binary frames only')
          return
        }
        ws.data.room.handleFrame(ws.data.seat, link, new Uint8Array(message))
      },
      close(ws) {
        if (ws.data.link !== null) ws.data.room.detach(ws.data.seat, ws.data.link)
      }
    }
  })
}