export type ProtocolErrorCode = 'truncated' | 'malformed' | 'too_large' | 'unsupported'

export class ProtocolError extends Error {
  readonly code: ProtocolErrorCode

  constructor(code: ProtocolErrorCode, message: string) {
    super(message)
    this.name = 'ProtocolError'
    this.code = code
  }
}