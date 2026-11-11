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
const auth = new Auth({ google: null, accounts: new SqliteAccountStore(db, () => Date.now()), publicOrigin: 'http://localhost:8080' })

describe('metrics endpoint', () => {
  const rooms = new RoomRegistry()
  const metrics = () => [{ name: 'aetherbound_test', help: 'A test gauge.', type: 'gauge' as const, value: 3 }]
  const services = { matchmaker: new Matchmaker(rooms, devMatchSetup, () => Date.now()), history: null, metrics }
  const open = createGameServer(loadConfig({ APP_ENV: 'test', PORT: '0', HOST: '127.0.0.1' }), () => true, rooms, auth, services)
  const guarded = createGameServer(loadConfig({ APP_ENV: 'test', PORT: '0', HOST: '127.0.0.1', METRICS_TOKEN: 'sixteen-chars-min' }), () => true, rooms, auth, services)

  afterAll(async () => {
    rooms.closeAll()
    await open.stop(true)
    await guarded.stop(true)
  })

  test('without a token it answers on loopback in the prometheus format', async () => {
    const response = await fetch(new URL('/metrics', open.url))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(await response.text()).toContain('aetherbound_test 3')
    expect((await fetch(new URL('/metrics', open.url), { method: 'POST' })).status).toBe(404)
  })

  test('with a token it needs the matching bearer header', async () => {
    const url = new URL('/metrics', guarded.url)
    expect((await fetch(url)).status).toBe(401)
    expect((await fetch(url, { headers: { authorization: 'Bearer wrong-token-value' } })).status).toBe(401)
    expect((await fetch(url, { headers: { authorization: 'Bearer sixteen-chars-min' } })).status).toBe(200)
  })
})