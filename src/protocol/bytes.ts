import { ProtocolError } from './errors'

const MAX_UINT32 = 4294967295
const MIN_INT32 = -2147483648
const MAX_INT32 = 2147483647

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

export class ByteWriter {
  private buffer: Uint8Array
  private length = 0
  private readonly maxBytes: number

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes
    this.buffer = new Uint8Array(Math.min(64, maxBytes))
  }

  get size(): number {
    return this.length
  }

  u8(value: number): this {
    if (!Number.isInteger(value) || value < 0 || value > 255) throw new ProtocolError('malformed', 'u8 out of range')
    this.reserve(1)
    this.buffer[this.length] = value
    this.length += 1
    return this
  }

  varuint(value: number): this {
    if (!Number.isInteger(value) || value < 0 || value > MAX_UINT32) throw new ProtocolError('malformed', 'varuint out of range')
    let rest = value
    while (rest >= 0x80) {
      this.u8((rest % 0x80) | 0x80)
      rest = Math.floor(rest / 0x80)
    }
    return this.u8(rest)
  }

  varint(value: number): this {
    if (!Number.isInteger(value) || value < MIN_INT32 || value > MAX_INT32) throw new ProtocolError('malformed', 'varint out of range')
    return this.varuint(value >= 0 ? value * 2 : -value * 2 - 1)
  }

  string(value: string, maxBytes: number): this {
    const encoded = encoder.encode(value)
    if (encoded.length > maxBytes) throw new ProtocolError('too_large', `string exceeds ${maxBytes} bytes`)
    this.varuint(encoded.length)
    return this.raw(encoded)
  }

  raw(data: Uint8Array): this {
    this.reserve(data.length)
    this.buffer.set(data, this.length)
    this.length += data.length
    return this
  }

  finish(): Uint8Array {
    return this.buffer.slice(0, this.length)
  }

  private reserve(extra: number): void {
    const needed = this.length + extra
    if (needed > this.maxBytes) throw new ProtocolError('too_large', `output exceeds ${this.maxBytes} bytes`)
    if (needed <= this.buffer.length) return
    const grown = new Uint8Array(Math.min(this.maxBytes, Math.max(needed, this.buffer.length * 2)))
    grown.set(this.buffer.subarray(0, this.length))
    this.buffer = grown
  }
}

export class ByteReader {
  private offset = 0
  private readonly data: Uint8Array

  constructor(data: Uint8Array) {
    this.data = data
  }

  get remaining(): number {
    return this.data.length - this.offset
  }

  u8(): number {
    const value = this.data[this.offset]
    if (value === undefined) throw new ProtocolError('truncated', 'unexpected end of data')
    this.offset += 1
    return value
  }

  varuint(): number {
    let result = 0
    for (let index = 0; index < 5; index += 1) {
      const byte = this.u8()
      const bits = byte & 0x7f
      if (index === 4 && bits > 0x0f) throw new ProtocolError('malformed', 'varuint overflow')
      result += bits * 2 ** (7 * index)
      if ((byte & 0x80) === 0) {
        if (index > 0 && bits === 0) throw new ProtocolError('malformed', 'non-canonical varuint')
        return result
      }
    }
    throw new ProtocolError('malformed', 'varuint too long')
  }

  varint(): number {
    const zigzag = this.varuint()
    return zigzag % 2 === 0 ? zigzag / 2 : -(zigzag + 1) / 2
  }

  string(maxBytes: number): string {
    const length = this.varuint()
    if (length > maxBytes) throw new ProtocolError('too_large', `string exceeds ${maxBytes} bytes`)
    const encoded = this.raw(length)
    try {
      return decoder.decode(encoded)
    } catch {
      throw new ProtocolError('malformed', 'invalid utf-8')
    }
  }

  raw(length: number): Uint8Array {
    if (length > this.remaining) throw new ProtocolError('truncated', 'unexpected end of data')
    const slice = this.data.subarray(this.offset, this.offset + length)
    this.offset += length
    return slice
  }

  expectEnd(): void {
    if (this.remaining > 0) throw new ProtocolError('malformed', 'trailing bytes')
  }
}