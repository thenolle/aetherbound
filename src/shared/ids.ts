import { DomainError } from './errors'

declare const brand: unique symbol

export type Brand<T, B extends string> = T & { readonly [brand]: B }

export type IdKind = 'card' | 'hero' | 'faction' | 'board' | 'player' | 'match'

export type Id<K extends IdKind> = Brand<string, K>

const ID_PATTERN = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/
const ID_MAX_LENGTH = 64

export function isValidId(raw: string): boolean {
  return raw.length > 0 && raw.length <= ID_MAX_LENGTH && ID_PATTERN.test(raw)
}

export function parseId<K extends IdKind>(kind: K, raw: string): Id<K> {
  if (!isValidId(raw)) throw new DomainError('invalid_command', `invalid ${kind} id`)
  return raw as Id<K>
}