import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { encodeCommandFrame } from '../protocol/commands'
import { decodeServerFrame } from '../protocol/server'
import type { ServerMessage } from '../protocol/server'
import { loadConfig } from '../shared/config'
import { createGameServer } from './gateway'
import { RoomRegistry } from './rooms'

const toOwnedBytes = (value: ArrayBuffer | ArrayBufferView): Uint8Array<ArrayBuffer> => {
  const source = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  const copy = new Uint8Array(new ArrayBuffer(source.byteLength))
  copy.set(source)
  return copy
}

class Inbox {
  private readonly queue: ServerMessage[] = []
  private wake: (() => void) | null = null

  constructor(socket: WebSocket) {
    socket.binaryType = 'arraybuffer'
    socket.addEventListener('message', (event) => {
      const payload = toOwnedBytes(event.data as ArrayBuffer | ArrayBufferView)
      this.queue.push(decodeServerFrame(payload).message)
      this.wake?.()
    })
  }

  async next<T extends ServerMessage['type']>(type: T): Promise<Extract<ServerMessage, { type: T }>> {
    const deadline = Date.now() + 3000
    for (;;) {
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

describe('game server', () => {
  const rooms = new RoomRegistry()
  const server = createGameServer(loadConfig({ APP_ENV: 'test', PORT: '0', HOST: '127.0.0.1' }), () => true, rooms)
  const url = (path: string): URL => new URL(path, server.url)

  afterAll(async () => {
    rooms.closeAll()
    await server.stop(true)
  })

  beforeAll(() => {
    expect(server.port).toBeGreaterThan(0)
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

  test('guards websocket upgrades and the dev endpoint', async () => {
    expect((await fetch(url('/ws?token=nope'))).status).toBe(401)
    const join = await fetch(url('/dev/join?room=guard&seat=0'))
    expect(join.status).toBe(200)
    const { token } = (await join.json()) as { token: string }
    expect((await fetch(url(`/ws?token=${token}`), { headers: { origin: 'http://evil.example' } })).status).toBe(403)
    expect((await fetch(url('/dev/join?room=Bad!&seat=0'))).status).toBe(400)
    expect((await fetch(url('/dev/join?room=guard&seat=2'))).status).toBe(400)

    const production = createGameServer(loadConfig({ APP_ENV: 'production', PORT: '0', HOST: '127.0.0.1' }), () => true, new RoomRegistry())
    expect((await fetch(new URL('/dev/join?room=a&seat=0', production.url))).status).toBe(404)
    await production.stop(true)
  })

  test('two clients play a turn end to end', async () => {
    const tokens: string[] = []
    for (const seat of [0, 1]) {
      const response = await fetch(url(`/dev/join?room=e2e&seat=${seat}`))
      tokens.push(((await response.json()) as { token: string }).token)
    }
    const wsUrl = (token: string): string => `ws://127.0.0.1:${server.port}/ws?token=${token}`
    const socket0 = new WebSocket(wsUrl(tokens[0] ?? ''))
    const inbox0 = new Inbox(socket0)
    const socket1 = new WebSocket(wsUrl(tokens[1] ?? ''))
    const inbox1 = new Inbox(socket1)
    await Promise.all([opened(socket0), opened(socket1)])

    const first0 = await inbox0.next('snapshot')
    const first1 = await inbox1.next('snapshot')
    expect(first0.view.viewer).toBe(0)
    expect(first1.view.viewer).toBe(1)
    expect(first0.view.self.hand).toHaveLength(4)

    socket0.send(toOwnedBytes(encodeCommandFrame(0, 'turn-1', { type: 'end_turn' })))
    expect(await inbox0.next('accepted')).toMatchObject({ commandSequence: 0, duplicate: false })
    const events = await inbox1.next('events')
    expect(events.events.some((item) => item.event.type === 'turn_started')).toBe(true)
    const after = await inbox1.next('snapshot')
    expect(after.view.active).toBe(1)
    expect(after.view.self.hand).toHaveLength(5)

    socket0.send(toOwnedBytes(encodeCommandFrame(1, 'turn-2', { type: 'end_turn' })))
    expect(await inbox0.next('rejected')).toMatchObject({ commandSequence: 1, code: 'not_your_turn' })

    socket0.close()
    socket1.close()
  }, 20000)
})