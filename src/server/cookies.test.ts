import { describe, expect, test } from 'bun:test'
import { parseCookies, serializeCookie } from './cookies'

describe('cookies', () => {
  test('parses a cookie header and keeps the first of duplicate names', () => {
    const cookies = parseCookies('a=1; b=two; a=3;  ; =x; c')
    expect(Object.fromEntries(cookies)).toEqual({ a: '1', b: 'two' })
    expect(parseCookies(null).size).toBe(0)
  })

  test('serializes hardened attributes and adds Secure on request', () => {
    expect(serializeCookie('s', 'abc_-1', { maxAgeSeconds: 60, path: '/', secure: false })).toBe('s=abc_-1; Max-Age=60; Path=/; HttpOnly; SameSite=Lax')
    expect(serializeCookie('s', 'abc', { maxAgeSeconds: 60, path: '/', secure: true })).toContain('; Secure')
    expect(serializeCookie('s', '', { maxAgeSeconds: 0, path: '/x', secure: false })).toContain('Max-Age=0')
  })

  test('refuses values that could break out of the header', () => {
    expect(() => serializeCookie('s', 'a;b', { maxAgeSeconds: 1, path: '/', secure: false })).toThrow()
    expect(() => serializeCookie('s', 'a\r\nSet-Cookie: x=1', { maxAgeSeconds: 1, path: '/', secure: false })).toThrow()
  })
})