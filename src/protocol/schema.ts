import { ByteReader, ByteWriter } from './bytes'
import { ProtocolError } from './errors'

export type FieldKind = 'uint' | 'optuint' | 'string'

export type FieldSpec = readonly [name: string, kind: FieldKind]

export type MessageSchema = Readonly<{ id: number, fields: readonly FieldSpec[] }>

export type WireValue = number | string | undefined

export type WireValues = Readonly<Record<string, WireValue>>

export const MAX_FIELD_STRING_BYTES = 64

export function encodeFields(writer: ByteWriter, schema: MessageSchema, values: WireValues): void {
  for (const [name, kind] of schema.fields) {
    const value = values[name]
    switch (kind) {
      case 'uint':
        if (typeof value !== 'number') throw new ProtocolError('malformed', `field ${name} must be a number`)
        writer.varuint(value)
        break
      case 'optuint':
        if (value === undefined) {
          writer.u8(0)
        } else if (typeof value === 'number') {
          writer.u8(1)
          writer.varuint(value)
        } else {
          throw new ProtocolError('malformed', `field ${name} must be a number`)
        }
        break
      case 'string':
        if (typeof value !== 'string') throw new ProtocolError('malformed', `field ${name} must be a string`)
        writer.string(value, MAX_FIELD_STRING_BYTES)
        break
    }
  }
}

export function decodeFields(reader: ByteReader, schema: MessageSchema): WireValues {
  const values: Record<string, WireValue> = {}
  for (const [name, kind] of schema.fields) {
    switch (kind) {
      case 'uint':
        values[name] = reader.varuint()
        break
      case 'optuint': {
        const present = reader.u8()
        if (present === 0) values[name] = undefined
        else if (present === 1) values[name] = reader.varuint()
        else throw new ProtocolError('malformed', `field ${name} has an invalid presence byte`)
        break
      }
      case 'string':
        values[name] = reader.string(MAX_FIELD_STRING_BYTES)
        break
    }
  }
  return values
}