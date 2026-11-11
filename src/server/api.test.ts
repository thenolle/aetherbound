import { afterAll, describe, expect, test } from 'bun:test'
import { SqliteAccountStore } from '../persistence/account-store'
import { migrate, openDatabase } from '../persistence/database'
import { MIGRATIONS } from '../persistence/migrations'
import { loadConfig } from '../shared/config'
import { Auth } from './auth'
import { devMatchSetup } from './dev-match'
import { createGameServer } from './gateway'
import { Matchmaker } from './matchmaker'
import { RoomRegistry } from './rooms'

const db = openDatabase(':memory:')
migrate(db, MIGRATIONS)
const accounts = new SqliteAccountStore(db, () => Date.now())
const auth = new Auth({ google: null, accounts, publicOrigin: 'http://localhost:8080' })

function signIn(sub: string): string {
  const account = accounts.upsertGoogleAccount(sub, `Player ${sub}`)
  return `aetherbound_session=${accounts.createSession(account.id, null, 3_600_000).token}`
}

describe('api', () => {
  const rooms = new RoomRegistry()
  const services = { matchmaker: new Matchmaker(rooms, devMatchSetup, () => Date.now()), history: null }
  const server = createGameServer(loadConfig({ APP_ENV: 'test', PORT: '0', HOST: '127.0.0.1' }), () => true, rooms, auth, services)
  const url = (path: string): URL => new URL(path, server.url)
  const post = (path: string, cookie: string, headers: Record<string, string> = {}): Promise<Response> =>
    fetch(url(path), { method: 'POST', headers: { cookie, ...headers } })

  afterAll(async () => {
    rooms.closeAll()
    await server.stop(true)
  })

  test('every api route needs a session and mutating routes refuse other origins', async () => {
    expect((await fetch(url('/api/queue/status'))).status).toBe(401)
    expect((await fetch(url('/api/history'))).status).toBe(401)
    const cookie = signIn('api-1')
    expect((await post('/api/queue/join', cookie, { origin: 'http://evil.example' })).status).toBe(403)
    expect((await fetch(url('/api/history'), { headers: { cookie } })).status).toBe(404)
    expect((await fetch(url('/api/unknown'), { headers: { cookie } })).status).toBe(404)
  })

  test('two queued accounts are matched and their tokens only work for them', async () => {
    const alice = signIn('api-alice')
    const bob = signIn('api-bob')
    expect(await (await post('/api/queue/join', alice)).json()).toEqual({ status: 'waiting' })
    const joined = (await (await post('/api/queue/join', bob)).json()) as { status: string, token: string }
    expect(joined.status).toBe('matched')
    const seen = (await (await fetch(url('/api/queue/status'), { headers: { cookie: alice } })).json()) as { status: string, token: string }
    expect(seen.status).toBe('matched')
    expect(seen.token).not.toBe(joined.token)

    expect((await fetch(url(`/ws?token=${seen.token}`), { headers: { cookie: alice } })).status).toBe(400)
    expect((await fetch(url(`/ws?token=${seen.token}`), { headers: { cookie: bob } })).status).toBe(401)
  })

  test('leaving the queue returns to idle', async () => {
    const cookie = signIn('api-leaver')
    await post('/api/queue/join', cookie)
    expect((await post('/api/queue/leave', cookie)).status).toBe(204)
    expect(await (await fetch(url('/api/queue/status'), { headers: { cookie } })).json()).toEqual({ status: 'idle' })
  })
})