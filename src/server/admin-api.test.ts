import { afterAll, describe, expect, test } from 'bun:test'
import { SqliteAccountStore } from '../persistence/account-store'
import { migrate, openDatabase } from '../persistence/database'
import { IntegrityStore } from '../persistence/integrity-store'
import { MIGRATIONS } from '../persistence/migrations'
import { SeasonStore } from '../persistence/season-store'
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

function signIn(sub: string): { id: string, cookie: string } {
  const account = accounts.upsertGoogleAccount(sub, `Player ${sub}`)
  return { id: account.id, cookie: `aetherbound_session=${accounts.createSession(account.id, null, 3_600_000).token}` }
}

describe('admin and leaderboard api', () => {
  const rooms = new RoomRegistry()
  const server = createGameServer(loadConfig({ APP_ENV: 'test', PORT: '0', HOST: '127.0.0.1' }), () => true, rooms, auth, {
    matchmaker: new Matchmaker(rooms, devMatchSetup, () => Date.now()),
    history: null,
    seasons: new SeasonStore(db, () => Date.now()),
    integrity: new IntegrityStore(db, () => Date.now())
  })
  const url = (path: string): URL => new URL(path, server.url)

  afterAll(async () => {
    rooms.closeAll()
    await server.stop(true)
  })

  test('admin routes answer 404 to everyone but admins', async () => {
    const player = signIn('player')
    expect((await fetch(url('/api/admin/flags'), { headers: { cookie: player.cookie } })).status).toBe(404)
    expect((await fetch(url('/api/admin/flags'))).status).toBe(401)
    db.run("UPDATE accounts SET role = 'admin' WHERE id = ?1", [player.id])
    const response = await fetch(url('/api/admin/flags'), { headers: { cookie: player.cookie } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ flags: [] })
  })

  test('the leaderboard shows the current season', async () => {
    const player = signIn('viewer')
    const body = (await (await fetch(url('/api/leaderboard'), { headers: { cookie: player.cookie } })).json()) as { season: { id: number }, entries: unknown[] }
    expect(body.season.id).toBe(1)
    expect(body.entries).toEqual([])
  })
})