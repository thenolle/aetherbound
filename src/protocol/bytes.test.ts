import { describe, expect, test } from 'bun:test'
import { ByteReader, ByteWriter } from './bytes'
import { ProtocolError } from './errors'
import type { ProtocolErrorCode } from './errors'

const bytesOf = (build: (writer: ByteWriter) => void): number[] => {
  const writer = new ByteWriter(128)
  build(writer)
  return Array.from(writer.finish())
}

const reader = (...bytes: number[]): ByteReader => new ByteReader(new Uint8Array(bytes))

const codeOf = (fn: () => unknown): ProtocolErrorCode | null => {
  try {
    fn()
    return null
  } catch (error) {
    if (error instanceof ProtocolError) return error.code
    throw error
  }
}

describe('varuint', () => {
  test('round trips boundary values', () => {
    for (const value of [0, 1, 127, 128, 300, 16383, 16384, 2 ** 31, 2 ** 32 - 1]) {
      const input = new ByteReader(new ByteWriter(16).varuint(value).finish())
      expect(input.varuint()).toBe(value)
      input.expectEnd()
    }
  })

  test('matches golden byte strings', () => {
    expect(bytesOf((w) => w.varuint(0))).toEqual([0x00])
    expect(bytesOf((w) => w.varuint(127))).toEqual([0x7f])
    expect(bytesOf((w) => w.varuint(128))).toEqual([0x80, 0x01])
    expect(bytesOf((w) => w.varuint(300))).toEqual([0xac, 0x02])
    expect(bytesOf((w) => w.varuint(2 ** 32 - 1))).toEqual([0xff, 0xff, 0xff, 0xff, 0x0f])
  })

  test('rejects truncated, overlong, non-canonical and overflowing encodings', () => {
    expect(codeOf(() => reader(0x80).varuint())).toBe('truncated')
    expect(codeOf(() => reader(0x80, 0x80, 0x80, 0x80, 0x80, 0x01).varuint())).toBe('malformed')
    expect(codeOf(() => reader(0x80, 0x00).varuint())).toBe('malformed')
    expect(codeOf(() => reader(0xff, 0xff, 0xff, 0xff, 0x1f).varuint())).toBe('malformed')
  })
})

describe('varint', () => {
  test('round trips signed values and matches golden bytes', () => {
    for (const value of [0, 1, -1, 2, -2, 63, -64, 2 ** 31 - 1, -(2 ** 31)]) {
      const input = new ByteReader(new ByteWriter(16).varint(value).finish())
      expect(input.varint()).toBe(value)
    }
    expect(bytesOf((w) => w.varint(-1))).toEqual([0x01])
    expect(bytesOf((w) => w.varint(1))).toEqual([0x02])
    expect(bytesOf((w) => w.varint(-(2 ** 31)))).toEqual([0xff, 0xff, 0xff, 0xff, 0x0f])
  })
})

describe('string', () => {
  test('round trips utf-8 and keeps a leading byte order mark', () => {
    for (const value of ['', 'abc', "Pique de l'Assesseur", '\u00e9\u4e2d\ud83d\ude00', '\ufeffbom']) {
      const input = new ByteReader(new ByteWriter(64).string(value, 32).finish())
      expect(input.string(32)).toBe(value)
      input.expectEnd()
    }
    expect(bytesOf((w) => w.string('\u00e9', 8))).toEqual([0x02, 0xc3, 0xa9])
  })

  test('rejects invalid, oversized and truncated strings', () => {
    expect(codeOf(() => reader(0x01, 0xff).string(8))).toBe('malformed')
    expect(codeOf(() => reader(65, ...new Array<number>(65).fill(0x41)).string(64))).toBe('too_large')
    expect(codeOf(() => new ByteWriter(128).string('x'.repeat(65), 64))).toBe('too_large')
    expect(codeOf(() => reader(0x05, 0x41).string(8))).toBe('truncated')
  })
})

describe('limits', () => {
  test('the writer enforces its size cap and rejects out-of-range values', () => {
    expect(codeOf(() => new ByteWriter(2).u8(1).u8(2).u8(3))).toBe('too_large')
    expect(codeOf(() => new ByteWriter(8).varuint(-1))).toBe('malformed')
    expect(codeOf(() => new ByteWriter(8).varuint(1.5))).toBe('malformed')
    expect(codeOf(() => new ByteWriter(8).varuint(2 ** 32))).toBe('malformed')
    expect(codeOf(() => new ByteWriter(8).u8(256))).toBe('malformed')
    expect(codeOf(() => new ByteWriter(8).varint(2 ** 31))).toBe('malformed')
  })

  test('the reader detects truncation and trailing bytes', () => {
    expect(codeOf(() => reader().u8())).toBe('truncated')
    const input = reader(1, 2)
    input.u8()
    expect(codeOf(() => input.expectEnd())).toBe('malformed')
    expect(codeOf(() => reader(1, 2).raw(3))).toBe('truncated')
  })
})