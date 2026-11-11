import { ByteReader, ByteWriter } from './bytes'
import { ProtocolError } from './errors'

export const FRAME = { magic: 0xae, version: 1, maxHeaderBytes: 32 } as const

export type ParsedFrame = Readonly<{ id: number, sequence: number, body: ByteReader }>

export function writeFrame(id: number, sequence: number, payload: Uint8Array, maxPayload: number): Uint8Array {
  if (payload.length > maxPayload) throw new ProtocolError('too_large', 'payload exceeds the maximum size')
  return new ByteWriter(maxPayload + FRAME.maxHeaderBytes)
    .u8(FRAME.magic)
    .u8(FRAME.version)
    .u8(0)
    .varuint(id)
    .varuint(sequence)
    .varuint(payload.length)
    .raw(payload)
    .finish()
}

export function readFrame(data: Uint8Array, maxPayload: number, isKnownId: (id: number) => boolean): ParsedFrame {
  if (data.length > maxPayload + FRAME.maxHeaderBytes) throw new ProtocolError('too_large', 'frame exceeds the maximum size')
  const reader = new ByteReader(data)
  if (reader.u8() !== FRAME.magic) throw new ProtocolError('malformed', 'bad magic')
  if (reader.u8() !== FRAME.version) throw new ProtocolError('unsupported', 'unsupported protocol version')
  if (reader.u8() !== 0) throw new ProtocolError('unsupported', 'unsupported flags')
  const id = reader.varuint()
  if (!isKnownId(id)) throw new ProtocolError('unsupported', 'unknown message id')
  const sequence = reader.varuint()
  const length = reader.varuint()
  if (length > maxPayload) throw new ProtocolError('too_large', 'payload exceeds the maximum size')
  if (length > reader.remaining) throw new ProtocolError('truncated', 'payload is shorter than declared')
  if (length < reader.remaining) throw new ProtocolError('malformed', 'trailing bytes after payload')
  return { id, sequence, body: new ByteReader(reader.raw(length)) }
}