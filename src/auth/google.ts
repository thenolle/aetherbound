export type GoogleConfig = Readonly<{ clientId: string, clientSecret: string, redirectUri: string }>

export type GoogleIdentity = Readonly<{ sub: string, displayName: string }>

export type AuthorizationParams = Readonly<{ state: string, nonce: string, codeChallenge: string }>

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

export type GoogleClient = {
  authorizationUrl(params: AuthorizationParams): Promise<string>
  exchangeCode(code: string, codeVerifier: string, expectedNonce: string): Promise<GoogleIdentity>
}

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GoogleAuthError'
  }
}

export const DISCOVERY_URL = 'https://accounts.google.com/.well-known/openid-configuration'

const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com'])
const DISCOVERY_TTL_MS = 3_600_000
const CLOCK_SKEW_SECONDS = 300
const MAX_NAME_CODE_POINTS = 40

type Endpoints = Readonly<{ authorization: string, token: string }>

function textField(body: unknown, key: string): string | null {
  if (typeof body !== 'object' || body === null) return null
  const value = (body as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

function numberField(body: Record<string, unknown>, key: string): number | null {
  const value = body[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function httpsUrl(value: string | null, what: string): string {
  if (value === null) throw new GoogleAuthError(`discovery document has no ${what}`)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new GoogleAuthError(`discovery ${what} is not a url`)
  }
  if (url.protocol !== 'https:') throw new GoogleAuthError(`discovery ${what} is not https`)
  return url.toString()
}

function decodePayload(idToken: string): Record<string, unknown> {
  const parts = idToken.split('.')
  if (parts.length !== 3) throw new GoogleAuthError('malformed id token')
  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString('utf8'))
  } catch {
    throw new GoogleAuthError('malformed id token payload')
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new GoogleAuthError('malformed id token payload')
  }
  return payload as Record<string, unknown>
}

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Arbiter'
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  const clipped = Array.from(cleaned).slice(0, MAX_NAME_CODE_POINTS).join('').trim()
  return clipped.length > 0 ? clipped : 'Arbiter'
}

export class GoogleOidc implements GoogleClient {
  private readonly config: GoogleConfig
  private readonly fetcher: Fetcher
  private readonly now: () => number
  private cached: { endpoints: Endpoints, expiresAt: number } | null = null

  constructor(config: GoogleConfig, fetcher: Fetcher = (input, init) => fetch(input, init), now: () => number = () => Date.now()) {
    this.config = config
    this.fetcher = fetcher
    this.now = now
  }

  async authorizationUrl(params: AuthorizationParams): Promise<string> {
    const { authorization } = await this.discover()
    const url = new URL(authorization)
    url.searchParams.set('client_id', this.config.clientId)
    url.searchParams.set('redirect_uri', this.config.redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', 'openid profile')
    url.searchParams.set('state', params.state)
    url.searchParams.set('nonce', params.nonce)
    url.searchParams.set('code_challenge', params.codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('prompt', 'select_account')
    return url.toString()
  }

  async exchangeCode(code: string, codeVerifier: string, expectedNonce: string): Promise<GoogleIdentity> {
    const { token } = await this.discover()
    const response = await this.fetcher(token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier
      }).toString()
    })
    if (!response.ok) throw new GoogleAuthError(`token endpoint returned ${response.status}`)
    const idToken = textField(await response.json(), 'id_token')
    if (idToken === null) throw new GoogleAuthError('token response has no id token')
    return this.identityFrom(idToken, expectedNonce)
  }

  private identityFrom(idToken: string, expectedNonce: string): GoogleIdentity {
    const claims = decodePayload(idToken)
    const nowSeconds = this.now() / 1000

    const issuer = textField(claims, 'iss')
    if (issuer === null || !ISSUERS.has(issuer)) throw new GoogleAuthError('unexpected issuer')
    if (textField(claims, 'aud') !== this.config.clientId) throw new GoogleAuthError('unexpected audience')
    const expires = numberField(claims, 'exp')
    if (expires === null || expires <= nowSeconds) throw new GoogleAuthError('id token expired')
    const issued = numberField(claims, 'iat')
    if (issued === null || issued > nowSeconds + CLOCK_SKEW_SECONDS) throw new GoogleAuthError('id token issued in the future')
    if (textField(claims, 'nonce') !== expectedNonce) throw new GoogleAuthError('nonce mismatch')
    const sub = textField(claims, 'sub')
    if (sub === null || sub.length === 0 || sub.length > 255) throw new GoogleAuthError('missing subject')

    return { sub, displayName: sanitizeName(claims.name) }
  }

  private async discover(): Promise<Endpoints> {
    if (this.cached !== null && this.cached.expiresAt > this.now()) return this.cached.endpoints
    const response = await this.fetcher(DISCOVERY_URL)
    if (!response.ok) throw new GoogleAuthError(`discovery failed with status ${response.status}`)
    const body: unknown = await response.json()
    const endpoints: Endpoints = {
      authorization: httpsUrl(textField(body, 'authorization_endpoint'), 'authorization endpoint'),
      token: httpsUrl(textField(body, 'token_endpoint'), 'token endpoint')
    }
    this.cached = { endpoints, expiresAt: this.now() + DISCOVERY_TTL_MS }
    return endpoints
  }
}