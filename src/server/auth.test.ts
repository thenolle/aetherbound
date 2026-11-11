import { beforeEach, describe, expect, test } from 'bun:test'
import { GoogleAuthError } from '../auth/google'
import type { GoogleClient } from '../auth/google'
import { codeChallenge } from '../auth/tokens'
import { SqliteAccountStore } from '../persistence/account-store'
import { migrate, openDatabase } from '../persistence/database'
import { MIGRATIONS } from '../persistence/migrations'
import { Auth } from './auth'

const ORIGIN = 'http://localhost:8080'

let calls: { code: string, verifier: string, nonce: string }[]
let accounts: SqliteAccountStore

const google: GoogleClient = {
  authorizationUrl: async (params) =>
    `https://accounts.google.com/o/oauth2/v2/auth?state=${params.state}&nonce=${params.nonce}&cc=${params.codeChallenge}`,
  exchangeCode: async (code, verifier, nonce) => {
    calls.push({ code, verifier, nonce })
    if (code === 'bad') throw new GoogleAuthError('rejected')
    return { sub: 'sub-1', displayName: 'Mireille Vane' }
  }
}

beforeEach(() => {
  calls = []
  const db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  accounts = new SqliteAccountStore(db, () => Date.now())
})

const makeAuth = (origin = ORIGIN, client: GoogleClient | null = google): Auth =>
  new Auth({ google: client, accounts, publicOrigin: origin })

const request = (path: string, init?: RequestInit): Request => new Request(`${ORIGIN}${path}`, init)

const setCookie = (response: Response, name: string): string | null =>
  response.headers.getSetCookie().find((header) => header.startsWith(`${name}=`)) ?? null

const pair = (header: string | null): string => (header ?? '').split(';')[0] ?? ''

async function begin(auth: Auth) {
  const response = await auth.handle(request('/auth/google/start'))
  return { response, location: new URL(response.headers.get('location') ?? 'http://invalid'), flow: setCookie(response, 'aetherbound_flow') }
}

const callbackTo = (auth: Auth, state: string, code: string, flow: string | null): Promise<Response> =>
  auth.handle(request(`/auth/google/callback?code=${code}&state=${state}`, flow === null ? undefined : { headers: { cookie: pair(flow) } }))

describe('Auth', () => {
  test('start redirects to google with state and a pkce challenge and sets a flow cookie', async () => {
    const { response, location, flow } = await begin(makeAuth())
    expect(response.status).toBe(302)
    expect(location.origin).toBe('https://accounts.google.com')
    expect(location.searchParams.get('state')).toHaveLength(43)
    expect(flow).toContain('HttpOnly')
    expect(flow).toContain('SameSite=Lax')
    expect(flow).toContain('Path=/auth/google')
    expect(flow).not.toContain('Secure')
  })

  test('the callback signs the player in and binds the pkce verifier and nonce to the flow', async () => {
    const auth = makeAuth()
    const { location, flow } = await begin(auth)
    const response = await callbackTo(auth, location.searchParams.get('state') ?? '', 'abc', flow)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/')
    expect(setCookie(response, 'aetherbound_flow')).toContain('Max-Age=0')
    const session = setCookie(response, 'aetherbound_session')
    expect(session).toContain('HttpOnly')
    const challenge = location.searchParams.get('cc') ?? ''
    const nonce = location.searchParams.get('nonce') ?? ''
    expect(codeChallenge(calls[0]?.verifier ?? '')).toBe(challenge)
    expect(calls[0]?.nonce).toBe(nonce)

    const me = await auth.handle(request('/auth/me', { headers: { cookie: pair(session) } }))
    expect(me.status).toBe(200)
    expect(await me.json()).toMatchObject({ displayName: 'Mireille Vane' })
  })

  test('the callback rejects a wrong state, a missing flow cookie and a replayed flow', async () => {
    const auth = makeAuth()
    const first = await begin(auth)
    const wrong = await callbackTo(auth, 'not-the-state', 'abc', first.flow)
    expect(wrong.headers.get('location')).toBe('/?auth=failed')
    expect(setCookie(wrong, 'aetherbound_session')).toBeNull()

    const second = await begin(auth)
    const state = second.location.searchParams.get('state') ?? ''
    expect((await callbackTo(auth, state, 'abc', null)).headers.get('location')).toBe('/?auth=failed')

    const third = await begin(auth)
    const thirdState = third.location.searchParams.get('state') ?? ''
    expect((await callbackTo(auth, thirdState, 'abc', third.flow)).headers.get('location')).toBe('/')
    const replay = await callbackTo(auth, thirdState, 'abc', third.flow)
    expect(replay.headers.get('location')).toBe('/?auth=failed')
    expect(setCookie(replay, 'aetherbound_session')).toBeNull()
    expect(calls).toHaveLength(1)
  })

  test('a denied consent screen and a failed code exchange never create a session', async () => {
    const auth = makeAuth()
    const denied = await auth.handle(request('/auth/google/callback?error=access_denied'))
    expect(denied.headers.get('location')).toBe('/?auth=denied')

    const { location, flow } = await begin(auth)
    const failed = await callbackTo(auth, location.searchParams.get('state') ?? '', 'bad', flow)
    expect(failed.headers.get('location')).toBe('/?auth=failed')
    expect(setCookie(failed, 'aetherbound_session')).toBeNull()
  })

  test('me needs a valid session cookie', async () => {
    const auth = makeAuth()
    expect((await auth.handle(request('/auth/me'))).status).toBe(401)
    expect((await auth.handle(request('/auth/me', { headers: { cookie: 'aetherbound_session=forged' } }))).status).toBe(401)
  })

  test('logout revokes the session and refuses cross-origin requests', async () => {
    const auth = makeAuth()
    const { location, flow } = await begin(auth)
    const signedIn = await callbackTo(auth, location.searchParams.get('state') ?? '', 'abc', flow)
    const cookie = pair(setCookie(signedIn, 'aetherbound_session'))

    const evil = await auth.handle(request('/auth/logout', { method: 'POST', headers: { cookie, origin: 'http://evil.example' } }))
    expect(evil.status).toBe(403)
    expect((await auth.handle(request('/auth/me', { headers: { cookie } }))).status).toBe(200)

    const out = await auth.handle(request('/auth/logout', { method: 'POST', headers: { cookie, origin: ORIGIN } }))
    expect(out.status).toBe(204)
    expect(setCookie(out, 'aetherbound_session')).toContain('Max-Age=0')
    expect((await auth.handle(request('/auth/me', { headers: { cookie } }))).status).toBe(401)
  })

  test('without google credentials the sign-in routes report 503', async () => {
    const auth = makeAuth(ORIGIN, null)
    expect((await auth.handle(request('/auth/google/start'))).status).toBe(503)
    expect((await auth.handle(request('/auth/google/callback?code=a&state=b'))).status).toBe(503)
    expect((await auth.handle(request('/auth/unknown'))).status).toBe(404)
  })

  test('an https origin uses host-prefixed secure cookies', async () => {
    const auth = makeAuth('https://play.example.com')
    const { location, flow } = await begin(auth)
    expect(flow).toContain('Secure')
    const response = await callbackTo(auth, location.searchParams.get('state') ?? '', 'abc', flow)
    const session = setCookie(response, '__Host-aetherbound_session')
    expect(session).toContain('Secure')
    expect(session).toContain('Path=/')
    expect(session).not.toContain('Domain')
  })
})