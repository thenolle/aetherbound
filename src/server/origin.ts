export const NO_STORE = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } as const

export const json = (body: unknown, status: number): Response => Response.json(body, { status, headers: NO_STORE })
export const empty = (status: number): Response => new Response(null, { status, headers: NO_STORE })

export function originAllowed(request: Request, url: URL): boolean {
  const origin = request.headers.get('origin')
  if (origin === null) return true
  try {
    return new URL(origin).host === url.host
  } catch {
    return false
  }
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
export const isLoopback = (address: string): boolean => LOOPBACK.has(address)