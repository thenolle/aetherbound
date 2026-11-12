import { afterAll, describe, expect, test } from 'bun:test'
import { encodeCommandFrame } from '../protocol/commands'
import { decodeServerFrame } from '../protocol/server'
import type { ServerMessage } from '../protocol/server'
import { SqliteAccountStore } from '../persistence/account-store'
import { migrate, openDatabase } from '../persistence/database'
import { MIGRATIONS } from '../persistence/migrations'
import { loadConfig } from '../shared/config'
import { Auth } from './auth'
import { createGameServer } from './gateway'
import { RoomRegistry } from './rooms'
import { devMatchSetup } from './dev-match'
import { Matchmaker } from './matchmaker'

class Inbox {
  private readonly queue: ServerMessage[] = []
  private wake: (() => void) | null = null

  constructor(socket: WebSocket) {
    socket.binaryType = 'arraybuffer'
    socket.addEventListener('message', (event) => {
      const bytes = new Uint8Array(event.data as ArrayBuffer)
      this.queue.push(decodeServerFrame(bytes).message)
      this.wake?.()
    })
  }

  async next<T extends ServerMessage['type']>(type: T): Promise<Extract<ServerMessage, { type: T }>> {
    const deadline = Date.now() + 3000
    for (; ;) {
      const index = this.queue.findIndex((message) => message.type === type)
      if (index >= 0) return this.queue.splice(index, 1)[0] as Extract<ServerMessage, { type: T }>
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new Error(`timed out waiting for ${type}`)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.min(remaining, 50))
        this.wake = () => {
          clearTimeout(timer)
          resolve()
        }
      })
    }
  }
}

const opened = (socket: WebSocket): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', () => reject(new Error('websocket error')), { once: true })
  })

function openSocket(address: string, cookie: string): WebSocket {
  const options = { headers: { cookie } }
  return new WebSocket(address, options as unknown as string[])
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

const db = openDatabase(':memory:')
migrate(db, MIGRATIONS)
const accounts = new SqliteAccountStore(db, () => Date.now())
const auth = new Auth({ google: null, accounts, publicOrigin: 'http://localhost:8080' })

function signIn(sub: string): string {
  const account = accounts.upsertGoogleAccount(sub, `Player ${sub}`)
  return `aetherbound_session=${accounts.createSession(account.id, null, 3_600_000).token}`
}

describe('game server', () => {
  const rooms = new RoomRegistry()
  const services = { matchmaker: new Matchmaker(rooms, devMatchSetup, () => Date.now()), history: null }
  const server = createGameServer(loadConfig({ APP_ENV: 'test', PORT: '0', HOST: '127.0.0.1' }), () => true, rooms, auth, services)
  const url = (path: string): URL => new URL(path, server.url)
  const join = (room: string, cookie?: string): Promise<Response> =>
    fetch(url(`/dev/join?room=${room}`), { method: 'POST', headers: cookie === undefined ? {} : { cookie } })

  afterAll(async () => {
    rooms.closeAll()
    await server.stop(true)
  })

  test('serves the canvas shell, the client bundle and health', async () => {
    const shell = await fetch(url('/'))
    expect(shell.status).toBe(200)
    const html = await shell.text()
    expect(html).toContain('<canvas id="stage">')
    expect(html).toContain('/client.js')

    const script = await fetch(url('/client.js'))
    expect(script.status).toBe(200)
    expect(script.headers.get('content-type')).toContain('javascript')
    expect(await script.text()).toContain('webgl2')

    expect((await fetch(url('/healthz'))).status).toBe(200)
  }, 20000)

  test('seats are bound to signed-in accounts and the upgrade checks both token and session', async () => {
    const alice = signIn('alice')
    const bob = signIn('bob')
    const carol = signIn('carol')

    expect((await join('guard')).status).toBe(401)
    expect((await fetch(url('/dev/join?room=guard'))).status).toBe(404)
    expect((await join('Bad!', alice)).status).toBe(400)

    const first = (await (await join('guard', alice)).json()) as { seat: number, token: string }
    const again = (await (await join('guard', alice)).json()) as { seat: number, token: string }
    const second = (await (await join('guard', bob)).json()) as { seat: number, token: string }
    expect(first.seat).toBe(0)
    expect(again).toEqual(first)
    expect(second.seat).toBe(1)
    expect((await join('guard', carol)).status).toBe(409)

    expect((await fetch(url('/ws?token=nope'), { headers: { cookie: alice } })).status).toBe(401)
    expect((await fetch(url(`/ws?token=${first.token}`))).status).toBe(401)
    expect((await fetch(url(`/ws?token=${first.token}`), { headers: { cookie: bob } })).status).toBe(401)
    expect((await fetch(url(`/ws?token=${first.token}`), { headers: { cookie: alice, origin: 'http://evil.example' } })).status).toBe(403)

    expect((await fetch(url('/auth/me'))).status).toBe(401)
    expect(await (await fetch(url('/auth/me'), { headers: { cookie: alice } })).json()).toMatchObject({ displayName: 'Player alice' })
    expect((await fetch(url('/auth/google/start'))).status).toBe(503)

    const production = createGameServer(loadConfig({ APP_ENV: 'production', PORT: '0', HOST: '127.0.0.1' }), () => true, new RoomRegistry(), auth, services)
    const blocked = await fetch(new URL('/dev/join?room=a', production.url), { method: 'POST', headers: { cookie: alice } })
    expect(blocked.status).toBe(404)
    await production.stop(true)
  })

  test('two signed-in players play a turn end to end', async () => {
    const alice = signIn('alice-e2e')
    const bob = signIn('bob-e2e')
    const seatA = (await (await join('e2e', alice)).json()) as { seat: number, token: string }
    const seatB = (await (await join('e2e', bob)).json()) as { seat: number, token: string }
    const address = (token: string): string => `ws://127.0.0.1:${server.port}/ws?token=${token}`

    const socketA = openSocket(address(seatA.token), alice)
    const inboxA = new Inbox(socketA)
    const socketB = openSocket(address(seatB.token), bob)
    const inboxB = new Inbox(socketB)
    await Promise.all([opened(socketA), opened(socketB)])

    const firstA = await inboxA.next('snapshot')
    const firstB = await inboxB.next('snapshot')
    expect(firstA.view.viewer).toBe(0)
    expect(firstB.view.viewer).toBe(1)
    expect(firstA.view.self.hand).toHaveLength(4)

    const packetA = encodeCommandFrame(0, 'turn-1', { type: 'end_turn' })
    socketA.send(toArrayBuffer(packetA))
    expect(await inboxA.next('accepted')).toMatchObject({ commandSequence: 0, duplicate: false })
    const events = await inboxB.next('events')
    expect(events.events.some((item) => item.event.type === 'turn_started')).toBe(true)
    const after = await inboxB.next('snapshot')
    expect(after.view.active).toBe(1)
    expect(after.view.self.hand).toHaveLength(6)

    const packetB = encodeCommandFrame(1, 'turn-2', { type: 'end_turn' })
    socketA.send(toArrayBuffer(packetB))
    expect(await inboxA.next('rejected')).toMatchObject({ commandSequence: 1, code: 'not_your_turn' })

    socketA.close()
    socketB.close()
  }, 20000)
})