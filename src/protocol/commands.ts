import type { AttackTarget, Command } from '../rules/types'
import { ByteWriter } from './bytes'
import { ProtocolError } from './errors'
import { FRAME, readFrame, writeFrame } from './frame'
import { decodeFields, encodeFields } from './schema'
import type { MessageSchema, WireValues } from './schema'

export const PROTOCOL = { ...FRAME, maxCommandPayload: 256 } as const

export const COMMAND_SCHEMAS = {
  play: { id: 1, fields: [['commandId', 'string'], ['handIndex', 'uint'], ['position', 'uint'], ['targetUid', 'optuint']] },
  cast: { id: 2, fields: [['commandId', 'string'], ['handIndex', 'uint'], ['targetUid', 'optuint']] },
  equip: { id: 3, fields: [['commandId', 'string'], ['handIndex', 'uint']] },
  attack: { id: 4, fields: [['commandId', 'string'], ['attackerUid', 'uint'], ['targetKind', 'uint'], ['targetUid', 'optuint']] },
  hero_attack: { id: 5, fields: [['commandId', 'string'], ['targetKind', 'uint'], ['targetUid', 'optuint']] },
  hero_ability: { id: 6, fields: [['commandId', 'string'], ['targetUid', 'optuint']] },
  end_turn: { id: 7, fields: [['commandId', 'string']] },
  surrender: { id: 8, fields: [['commandId', 'string']] }
} as const satisfies Record<Command['type'], MessageSchema>

export type DecodedCommand = Readonly<{ sequence: number, commandId: string, command: Command }>

const SCHEMA_BY_ID = new Map<number, { type: Command['type'], schema: MessageSchema }>(
  (Object.keys(COMMAND_SCHEMAS) as Command['type'][]).map((type) => [COMMAND_SCHEMAS[type].id, { type, schema: COMMAND_SCHEMAS[type] }])
)

const malformed = (message: string): ProtocolError => new ProtocolError('malformed', message)

const requireNumber = (values: WireValues, key: string): number => {
  const value = values[key]
  if (typeof value !== 'number') throw malformed(`missing ${key}`)
  return value
}

const optionalNumber = (values: WireValues, key: string): number | undefined => {
  const value = values[key]
  if (value !== undefined && typeof value !== 'number') throw malformed(`invalid ${key}`)
  return value
}

const requireString = (values: WireValues, key: string): string => {
  const value = values[key]
  if (typeof value !== 'string') throw malformed(`missing ${key}`)
  return value
}

const withTarget = (targetUid: number | undefined): { targetUid?: number } => (targetUid === undefined ? {} : { targetUid })

function targetValues(target: AttackTarget): WireValues {
  return target.kind === 'hero' ? { targetKind: 0, targetUid: undefined } : { targetKind: 1, targetUid: target.uid }
}

function readTarget(values: WireValues): AttackTarget {
  const kind = requireNumber(values, 'targetKind')
  const uid = optionalNumber(values, 'targetUid')
  if (kind === 0) {
    if (uid !== undefined) throw malformed('hero target carries a uid')
    return { kind: 'hero' }
  }
  if (kind === 1) {
    if (uid === undefined) throw malformed('minion target needs a uid')
    return { kind: 'minion', uid }
  }
  throw malformed('unknown target kind')
}

function toValues(commandId: string, command: Command): WireValues {
  switch (command.type) {
    case 'play':
      return { commandId, handIndex: command.handIndex, position: command.position, targetUid: command.targetUid }
    case 'cast':
      return { commandId, handIndex: command.handIndex, targetUid: command.targetUid }
    case 'equip':
      return { commandId, handIndex: command.handIndex }
    case 'attack':
      return { commandId, attackerUid: command.attackerUid, ...targetValues(command.target) }
    case 'hero_attack':
      return { commandId, ...targetValues(command.target) }
    case 'hero_ability':
      return { commandId, targetUid: command.targetUid }
    case 'end_turn':
    case 'surrender':
      return { commandId }
  }
}

function fromValues(type: Command['type'], values: WireValues): Command {
  switch (type) {
    case 'play':
      return {
        type,
        handIndex: requireNumber(values, 'handIndex'),
        position: requireNumber(values, 'position'),
        ...withTarget(optionalNumber(values, 'targetUid'))
      }
    case 'cast':
      return { type, handIndex: requireNumber(values, 'handIndex'), ...withTarget(optionalNumber(values, 'targetUid')) }
    case 'equip':
      return { type, handIndex: requireNumber(values, 'handIndex') }
    case 'attack':
      return { type, attackerUid: requireNumber(values, 'attackerUid'), target: readTarget(values) }
    case 'hero_attack':
      return { type, target: readTarget(values) }
    case 'hero_ability':
      return { type, ...withTarget(optionalNumber(values, 'targetUid')) }
    case 'end_turn':
    case 'surrender':
      return { type }
  }
}

export function encodeCommandFrame(sequence: number, commandId: string, command: Command): Uint8Array {
  const schema = COMMAND_SCHEMAS[command.type]
  const body = new ByteWriter(PROTOCOL.maxCommandPayload)
  encodeFields(body, schema, toValues(commandId, command))
  return writeFrame(schema.id, sequence, body.finish(), PROTOCOL.maxCommandPayload)
}

export function decodeCommandFrame(data: Uint8Array): DecodedCommand {
  const frame = readFrame(data, PROTOCOL.maxCommandPayload, (id) => SCHEMA_BY_ID.has(id))
  const entry = SCHEMA_BY_ID.get(frame.id)
  if (entry === undefined) throw new ProtocolError('unsupported', 'unknown message id')
  const values = decodeFields(frame.body, entry.schema)
  frame.body.expectEnd()
  return { sequence: frame.sequence, commandId: requireString(values, 'commandId'), command: fromValues(entry.type, values) }
}