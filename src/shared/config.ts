export type AppEnv = 'development' | 'test' | 'production'
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type AppConfig = Readonly<{
  env: AppEnv
  host: string
  port: number
  region: string
  logLevel: LogLevel
  databasePath: string
}>

export class ConfigError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(`Invalid configuration:\n- ${issues.join('\n- ')}`)
    this.name = 'ConfigError'
    this.issues = issues
  }
}

const APP_ENVS: readonly AppEnv[] = ['development', 'test', 'production']
const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error']
const REGION_PATTERN = /^[a-z]{2,}(-[a-z0-9]+)*$/

function pick<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T, name: string, issues: string[]): T {
  if (raw === undefined || raw === '') return fallback
  const match = allowed.find((value) => value === raw)
  if (match === undefined) issues.push(`${name} must be one of ${allowed.join(', ')} (got "${raw}")`)
  return match ?? fallback
}

export function loadConfig(env: Readonly<Record<string, string | undefined>>): AppConfig {
  const issues: string[] = []
  const appEnv = pick(env.APP_ENV, APP_ENVS, 'development', 'APP_ENV', issues)
  const logLevel = pick(env.LOG_LEVEL, LOG_LEVELS, 'info', 'LOG_LEVEL', issues)

  const rawPort = env.PORT === undefined || env.PORT === '' ? '8080' : env.PORT
  const port = Number(rawPort)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    issues.push(`PORT must be an integer between 0 and 65535 (got "${rawPort}")`)
  }

  const region = env.REGION === undefined || env.REGION === '' ? 'local' : env.REGION
  if (!REGION_PATTERN.test(region)) {
    issues.push(`REGION must match ${REGION_PATTERN} (got "${region}")`)
  }

  const host = env.HOST === undefined || env.HOST === '' ? '0.0.0.0' : env.HOST
  const databasePath = env.DATABASE_PATH === undefined || env.DATABASE_PATH === '' ? 'data/aetherbound.db' : env.DATABASE_PATH

  if (issues.length > 0) throw new ConfigError(issues)
  return { env: appEnv, host, port, region, logLevel, databasePath }
}