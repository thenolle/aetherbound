import { timingSafeEqual } from 'node:crypto'
import { isLoopback } from './origin'

export type Metric = Readonly<{
  name: string
  help: string
  type: 'gauge' | 'counter'
  value: number
  labels?: Readonly<Record<string, string>>
}>

const NAME_PATTERN = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/
const LABEL_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/

const escapeText = (text: string): string => text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')
const escapeLabel = (text: string): string => escapeText(text).replace(/"/g, '\\"')

export function renderMetrics(metrics: readonly Metric[]): string {
  const lines: string[] = []
  const declared = new Set<string>()
  for (const metric of metrics) {
    if (!NAME_PATTERN.test(metric.name) || !Number.isFinite(metric.value)) throw new Error(`invalid metric ${metric.name}`)
    if (!declared.has(metric.name)) {
      lines.push(`# HELP ${metric.name} ${escapeText(metric.help)}`)
      lines.push(`# TYPE ${metric.name} ${metric.type}`)
      declared.add(metric.name)
    }
    const labels = Object.entries(metric.labels ?? {}).map(([key, value]) => {
      if (!LABEL_PATTERN.test(key)) throw new Error(`invalid label ${key}`)
      return `${key}="${escapeLabel(value)}"`
    })
    lines.push(`${metric.name}${labels.length > 0 ? `{${labels.join(',')}}` : ''} ${metric.value}`)
  }
  return `${lines.join('\n')}\n`
}

export function metricsAllowed(authorization: string | null, address: string, token: string | null): boolean {
  if (token === null) return isLoopback(address)
  const expected = Buffer.from(`Bearer ${token}`)
  const given = Buffer.from(authorization ?? '')
  return given.length === expected.length && timingSafeEqual(given, expected)
}