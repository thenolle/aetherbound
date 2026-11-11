import type { LogLevel } from './config'

const RANK: Readonly<Record<LogLevel, number>> = { debug: 10, info: 20, warn: 30, error: 40 }

export type Logger = Readonly<Record<LogLevel, (message: string, fields?: Record<string, unknown>) => void>>

export function createLogger(level: LogLevel, base: Record<string, unknown> = {}): Logger {
  const emit = (target: LogLevel) => (message: string, fields: Record<string, unknown> = {}): void => {
    if (RANK[target] < RANK[level]) return
    console.log(JSON.stringify({ time: new Date().toISOString(), level: target, message, ...base, ...fields }))
  }
  return { debug: emit('debug'), info: emit('info'), warn: emit('warn'), error: emit('error') }
}