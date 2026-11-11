import { describe, expect, test } from 'bun:test'
import { DomainError } from './errors'
import { isValidId, parseId } from './ids'

describe('ids', () => {
  test('accepts lowercase slug ids', () => {
    expect(String(parseId('card', 'warden-mireille'))).toBe('warden-mireille')
    expect(isValidId('a.b_c-1')).toBe(true)
  })

  test('rejects malformed ids', () => {
    for (const raw of ['', 'Upper', 'two  spaces', '-lead', 'trail-', 'a'.repeat(65), 'semi;colon']) expect(isValidId(raw)).toBe(false)
    expect(() => parseId('hero', 'Bad Id')).toThrow(DomainError)
  })
})