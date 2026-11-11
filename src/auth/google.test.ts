import { describe, expect, test } from 'bun:test'
import { DISCOVERY_URL, GoogleAuthError, GoogleOidc, sanitizeName } from './google'
import type { Fetcher } from './google'

const config = {
  clientId: 'cid.apps.googleusercontent.com',
  clientSecret: 'shh',
  redirectUri: 'http://localhost:8080/auth/google/callback'
}

const discovery = {
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token'
}

const NOW = 1_700_000_000_000

const jwt = (payload: Record<string, unknown>): string => {
  const part = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'RS256' })}.${part(payload)}.signature`
}

const claims = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  iss: 'https://accounts.google.com',
  aud: config.clientId,
  sub: '1076915',
  name: 'Mireille Vane',
  nonce: 'n1',
  iat: NOW / 1000 - 10,
  exp: NOW / 1000 + 3000,
  ...overrides
})

function fakeGoogle(idToken: string | null, tokenStatus = 200) {
  const calls: { url: string, body: string }[] = []
  const fetcher: Fetcher = async (input, init) => {
    calls.push({ url: input, body: String(init?.body ?? '') })
    if (input === DISCOVERY_URL) return Response.json(discovery)
    if (tokenStatus !== 200) return new Response('{}', { status: tokenStatus })
    return Response.json({ id_token: idToken, access_token: 'unused' })
  }
  return { fetcher, calls, client: new GoogleOidc(config, fetcher, () => NOW) }
}

describe('GoogleOidc', () => {
  test('builds an authorization url with state, nonce and pkce', async () => {
    const { client } = fakeGoogle(null)
    const url = new URL(await client.authorizationUrl({ state: 's1', nonce: 'n1', codeChallenge: 'cc1' }))
    expect(url.origin + url.pathname).toBe(discovery.authorization_endpoint)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'openid profile',
      state: 's1',
      nonce: 'n1',
      code_challenge: 'cc1',
      code_challenge_method: 'S256',
      prompt: 'select_account'
    })
  })

  test('exchanges a code for a verified identity', async () => {
    const { client, calls } = fakeGoogle(jwt(claims()))
    expect(await client.exchangeCode('abc', 'verifier-1', 'n1')).toEqual({ sub: '1076915', displayName: 'Mireille Vane' })
    const form = new URLSearchParams(calls.at(-1)?.body ?? '')
    expect(Object.fromEntries(form)).toEqual({
      code: 'abc',
      client_id: config.clientId,
      client_secret: 'shh',
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: 'verifier-1'
    })
    expect(calls.at(-1)?.url).toBe(discovery.token_endpoint)
  })

  test('caches the discovery document until it expires', async () => {
    let now = NOW
    const calls: string[] = []
    const fetcher: Fetcher = async (input) => {
      calls.push(input)
      return Response.json(discovery)
    }
    const client = new GoogleOidc(config, fetcher, () => now)
    await client.authorizationUrl({ state: 'a', nonce: 'b', codeChallenge: 'c' })
    await client.authorizationUrl({ state: 'a', nonce: 'b', codeChallenge: 'c' })
    expect(calls).toHaveLength(1)
    now += 3_600_001
    await client.authorizationUrl({ state: 'a', nonce: 'b', codeChallenge: 'c' })
    expect(calls).toHaveLength(2)
  })

  test('rejects id tokens with bad claims', async () => {
    const bad: Record<string, unknown>[] = [
      { iss: 'https://evil.example' },
      { aud: 'someone-else' },
      { exp: NOW / 1000 - 1 },
      { iat: NOW / 1000 + 1000 },
      { nonce: 'other' },
      { sub: '' },
      { sub: undefined }
    ]
    for (const overrides of bad) {
      const { client } = fakeGoogle(jwt(claims(overrides)))
      await expect(client.exchangeCode('abc', 'v', 'n1')).rejects.toBeInstanceOf(GoogleAuthError)
    }
  })

  test('rejects failing or garbled token responses', async () => {
    await expect(fakeGoogle(null, 400).client.exchangeCode('abc', 'v', 'n1')).rejects.toBeInstanceOf(GoogleAuthError)
    await expect(fakeGoogle(null).client.exchangeCode('abc', 'v', 'n1')).rejects.toBeInstanceOf(GoogleAuthError)
    await expect(fakeGoogle('not.a-jwt').client.exchangeCode('abc', 'v', 'n1')).rejects.toBeInstanceOf(GoogleAuthError)
    await expect(fakeGoogle('a.b.c').client.exchangeCode('abc', 'v', 'n1')).rejects.toBeInstanceOf(GoogleAuthError)
  })

  test('refuses a discovery document with non-https endpoints', async () => {
    const fetcher: Fetcher = async () => Response.json({ authorization_endpoint: 'http://insecure.example/auth', token_endpoint: discovery.token_endpoint })
    const client = new GoogleOidc(config, fetcher, () => NOW)
    await expect(client.authorizationUrl({ state: 'a', nonce: 'b', codeChallenge: 'c' })).rejects.toBeInstanceOf(GoogleAuthError)
  })

  test('display names are cleaned and bounded', () => {
    expect(sanitizeName('  Mireille\u0000   Vane \n')).toBe('Mireille Vane')
    expect(sanitizeName('x'.repeat(100))).toHaveLength(40)
    expect(sanitizeName(undefined)).toBe('Arbiter')
    expect(sanitizeName('   ')).toBe('Arbiter')
  })
})