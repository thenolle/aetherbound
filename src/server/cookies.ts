export type CookieOptions = Readonly<{ maxAgeSeconds: number, path: string, secure: boolean }>

const SAFE_VALUE = /^[A-Za-z0-9_-]*$/

export function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>()
  if (header === null) return cookies
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator <= 0) continue
    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (name.length > 0 && !cookies.has(name)) cookies.set(name, value)
  }
  return cookies
}

export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  if (!SAFE_VALUE.test(value)) throw new Error('cookie value contains unsafe characters')
  const parts = [`${name}=${value}`, `Max-Age=${options.maxAgeSeconds}`, `Path=${options.path}`, 'HttpOnly', 'SameSite=Lax']
  if (options.secure) parts.push('Secure')
  return parts.join('; ')
}