export function fieldOf(body: unknown, key: string): unknown {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined
}

export function numberOf(body: unknown, key: string): number | null {
  const value = fieldOf(body, key)
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function textOf(body: unknown, key: string): string | null {
  const value = fieldOf(body, key)
  return typeof value === 'string' ? value : null
}