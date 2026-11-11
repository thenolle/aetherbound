export const ERROR_CODES = [
  'invalid_command',
  'not_your_turn',
  'insufficient_aether',
  'illegal_target',
  'board_full',
  'deck_invalid',
  'invalid_content',
  'unauthorized',
  'rate_limited',
  'internal'
] as const

export type ErrorCode = typeof ERROR_CODES[number]

export class DomainError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}