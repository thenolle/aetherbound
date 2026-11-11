import { timingSafeEqual } from 'node:crypto'
import type { GoogleClient } from '../auth/google'
import { codeChallenge, randomToken } from '../auth/tokens'
import type { Account, SqliteAccountStore } from '../persistence/account-store'
import { parseCookies, serializeCookie } from './cookies'

export type AuthOptions = Readonly<{
  google: GoogleClient | null
  accounts: SqliteAccountStore
  publicOrigin: string
  onAccountDeleted?: (accountId: string) => void
}>

const FLOW_COOKIE = 'aetherbound_flow'
const FLOW_PATH = '/auth/google'
const FLOW_TTL_MS = 600_000
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000
const MAX_CODE_LENGTH = 2048
const NO_STORE = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } as const

function respond(init: ResponseInit, body: BodyInit | null, cookies: readonly string[], extra: Record<string, string> = {}): Response {
  const headers = new Headers(NO_STORE)
  for (const [name, value] of Object.entries(extra)) headers.set(name, value)
  for (const cookie of cookies) headers.append('set-cookie', cookie)
  return new Response(body, { ...init, headers })
}

const json = (body: unknown, status: number, cookies: readonly string[] = []): Response => respond({ status }, JSON.stringify(body), cookies, { 'content-type': 'application/json' })
const redirect = (location: string, cookies: readonly string[]): Response => respond({ status: 302 }, null, cookies, { location })

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export class Auth {
  private readonly google: GoogleClient | null
  private readonly accounts: SqliteAccountStore
  private readonly publicOrigin: string
  private readonly secure: boolean
  private readonly sessionName: string
  private readonly onAccountDeleted: (accountId: string) => void

  constructor(options: AuthOptions) {
    this.google = options.google
    this.accounts = options.accounts
    this.publicOrigin = options.publicOrigin
    this.secure = options.publicOrigin.startsWith('https://')
    this.sessionName = this.secure ? '__Host-aetherbound_session' : 'aetherbound_session'
    this.onAccountDeleted = options.onAccountDeleted ?? (() => undefined)
  }

  authenticate(request: Request): Account | null {
    const token = parseCookies(request.headers.get('cookie')).get(this.sessionName)
    return token === undefined || token === '' ? null : this.accounts.resolveSession(token)
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    switch (`${request.method} ${url.pathname}`) {
      case 'GET /auth/google/start': return this.start()
      case 'GET /auth/google/callback': return this.callback(request, url)
      case 'GET /auth/me': return this.me(request)
      case 'POST /auth/logout': return this.logout(request)
      case 'GET /auth/sessions': return this.sessions(request)
      case 'POST /auth/sessions/revoke': return this.revokeSession(request, url)
      case 'POST /auth/delete': return this.deleteAccount(request)
      default: return json({ error: 'not_found' }, 404)
    }
  }

  private sessionToken(request: Request): string | null {
    const token = parseCookies(request.headers.get('cookie')).get(this.sessionName)
    return token === undefined || token === '' ? null : token
  }

  private crossOrigin(request: Request): boolean {
    const origin = request.headers.get('origin')
    return origin !== null && origin !== this.publicOrigin
  }

  private sessions(request: Request): Response {
    const account = this.authenticate(request)
    if (account === null) return json({ error: 'unauthorized' }, 401)
    return json({ sessions: this.accounts.listSessions(account.id, this.sessionToken(request)) }, 200)
  }

  private revokeSession(request: Request, url: URL): Response {
    if (this.crossOrigin(request)) return json({ error: 'forbidden_origin' }, 403)
    const account = this.authenticate(request)
    if (account === null) return json({ error: 'unauthorized' }, 401)
    const id = url.searchParams.get('id') ?? ''
    const current = this.accounts.listSessions(account.id, this.sessionToken(request)).find((entry) => entry.current)
    if (!/^[0-9a-f]{16}$/.test(id) || !this.accounts.revokeSessionById(account.id, id)) return json({ error: 'not_found' }, 404)
    return respond({ status: 204 }, null, current?.id === id ? [this.sessionCookie('', 0)] : [])
  }

  private async deleteAccount(request: Request): Promise<Response> {
    if (this.crossOrigin(request)) return json({ error: 'forbidden_origin' }, 403)
    const account = this.authenticate(request)
    if (account === null) return json({ error: 'unauthorized' }, 401)
    let body: unknown = null
    try { body = await request.json() } catch { body = null }
    if (typeof body !== 'object' || body === null || (body as Record<string, unknown>).confirm !== 'DELETE') return json({ error: 'confirmation_required' }, 400)
    this.accounts.deleteAccount(account.id)
    this.onAccountDeleted(account.id)
    return respond({ status: 204 }, null, [this.sessionCookie('', 0)])
  }

  private sessionCookie(value: string, maxAgeSeconds: number): string {
    return serializeCookie(this.sessionName, value, { maxAgeSeconds, path: '/', secure: this.secure })
  }

  private flowCookie(value: string, maxAgeSeconds: number): string {
    return serializeCookie(FLOW_COOKIE, value, { maxAgeSeconds, path: FLOW_PATH, secure: this.secure })
  }

  private async start(): Promise<Response> {
    if (this.google === null) return json({ error: 'google_not_configured' }, 503)
    const flowId = randomToken()
    const flow = { state: randomToken(), nonce: randomToken(), codeVerifier: randomToken() }
    try {
      const location = await this.google.authorizationUrl({ state: flow.state, nonce: flow.nonce, codeChallenge: codeChallenge(flow.codeVerifier) })
      this.accounts.saveFlow(flowId, flow, FLOW_TTL_MS)
      return redirect(location, [this.flowCookie(flowId, FLOW_TTL_MS / 1000)])
    } catch (error) {
      console.error('google sign-in could not start', error instanceof Error ? error.message : error)
      return json({ error: 'google_unreachable' }, 502)
    }
  }

  private async callback(request: Request, url: URL): Promise<Response> {
    if (this.google === null) return json({ error: 'google_not_configured' }, 503)
    const clearFlow = this.flowCookie('', 0)
    if (url.searchParams.has('error')) return redirect('/?auth=denied', [clearFlow])
    const flowId = parseCookies(request.headers.get('cookie')).get(FLOW_COOKIE)
    const flow = flowId === undefined || flowId === '' ? null : this.accounts.takeFlow(flowId)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (flow === null || code === null || state === null || code.length > MAX_CODE_LENGTH || !sameText(state, flow.state)) return redirect('/?auth=failed', [clearFlow])
    try {
      const identity = await this.google.exchangeCode(code, flow.codeVerifier, flow.nonce)
      const account = this.accounts.upsertGoogleAccount(identity.sub, identity.displayName)
      const session = this.accounts.createSession(account.id, request.headers.get('user-agent'), SESSION_TTL_MS)
      return redirect('/', [clearFlow, this.sessionCookie(session.token, SESSION_TTL_MS / 1000)])
    } catch (error) {
      console.error('google sign-in failed', error instanceof Error ? error.message : error)
      return redirect('/?auth=failed', [clearFlow])
    }
  }

  private me(request: Request): Response {
    const account = this.authenticate(request)
    if (account === null) return json({ error: 'unauthorized' }, 401)
    return json({ accountId: account.id, displayName: account.displayName }, 200)
  }

  private logout(request: Request): Response {
    const origin = request.headers.get('origin')
    if (origin !== null && origin !== this.publicOrigin) return json({ error: 'forbidden_origin' }, 403)
    const token = parseCookies(request.headers.get('cookie')).get(this.sessionName)
    if (token !== undefined && token !== '') this.accounts.revokeSession(token)
    return respond({ status: 204 }, null, [this.sessionCookie('', 0)])
  }
}