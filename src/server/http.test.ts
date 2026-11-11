import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { loadConfig } from '../shared/config'
import { createServer } from './http'

describe('http health endpoints', () => {
  let ready = true
  const server = createServer(loadConfig({ APP_ENV: 'test', PORT: '0', HOST: '127.0.0.1' }), () => ready)
  const url = (path: string): URL => new URL(path, server.url)

  beforeAll(() => {
    ready = true
  })

  afterAll(async () => {
    await server.stop(true)
  })

  test('healthz returns ok', async () => {
    const response = await fetch(url('/healthz'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok', region: 'local' })
  })

  test('readyz flips to 503 when draining', async () => {
    expect((await fetch(url('/readyz'))).status).toBe(200)
    ready = false
    expect((await fetch(url('/readyz'))).status).toBe(503)
    ready = true
  })

  test('unknown path is 404 and non-GET is 405', async () => {
    expect((await fetch(url('/nope'))).status).toBe(404)
    expect((await fetch(url('/healthz'), { method: 'POST' })).status).toBe(405)
  })
})