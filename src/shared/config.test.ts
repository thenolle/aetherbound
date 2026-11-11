import { describe, expect, test } from 'bun:test'
import { ConfigError, loadConfig } from './config'

describe('loadConfig', () => {
  test('applies defaults', () => {
    expect(loadConfig({})).toEqual({
      env: 'development',
      host: '0.0.0.0',
      port: 8080,
      region: 'local',
      logLevel: 'info',
      databasePath: 'data/aetherbound.db',
      publicOrigin: 'http://localhost:8080',
      googleClientId: null,
      googleClientSecret: null
    })
  })

  test('validates the public origin and the google credentials', () => {
    expect(() => loadConfig({ PUBLIC_ORIGIN: 'http://localhost:8080/app' })).toThrow(ConfigError)
    expect(() => loadConfig({ PUBLIC_ORIGIN: 'ftp://example.com' })).toThrow(ConfigError)
    expect(() => loadConfig({ GOOGLE_CLIENT_ID: 'only-an-id' })).toThrow(ConfigError)
    expect(loadConfig({ PUBLIC_ORIGIN: 'https://play.example.com', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' })).toMatchObject({
      publicOrigin: 'https://play.example.com',
      googleClientId: 'id',
      googleClientSecret: 'secret'
    })
  })

  test('reads valid values', () => {
    const config = loadConfig({ APP_ENV: 'production', PORT: '9000', REGION: 'eu-west', LOG_LEVEL: 'warn', HOST: '127.0.0.1' })
    expect(config.port).toBe(9000)
    expect(config.region).toBe('eu-west')
    expect(config.env).toBe('production')
  })

  test('reports every invalid value at once', () => {
    try {
      loadConfig({ APP_ENV: 'staging', PORT: 'abc', REGION: 'EU!', LOG_LEVEL: 'loud' })
      throw new Error('expected failure')
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError)
      expect((error as ConfigError).issues).toHaveLength(4)
    }
  })

  test('rejects out-of-range port', () => {
    expect(() => loadConfig({ PORT: '70000' })).toThrow(ConfigError)
  })
})