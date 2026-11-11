import { createHash } from 'node:crypto'

export function randomToken(bytes = 32): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString('base64url')
}

export function codeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}