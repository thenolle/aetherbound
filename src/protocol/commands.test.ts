import { describe, expect, test } from 'bun:test'
import { MatchSession } from '../rules/session'
import { fixtureSetup } from '../rules/test-fixtures'
import type { Command } from '../rules/types'
import { Rng } from '../shared/rng'
import { COMMAND_SCHEMAS, PROTOCOL, decodeCommandFrame, encodeCommandFrame } from './commands'
import { ProtocolError } from './errors'
import type { ProtocolErrorCode } from './errors'

const COMMANDS: readonly Command[] = [
  { type: 'play', handIndex: 2, position: 0 },
  { type: 'play', handIndex: 1, position: 3, targetUid: 77 },
  { type: 'cast', handIndex: 0 },
  { type: 'cast', handIndex: 4, targetUid: 9 },
  { type: 'equip', handIndex: 1 },
  { type: 'attack', attackerUid: 3, target: { kind: 'hero' } },
  { type: 'attack', attackerUid: 3, target: { kind: 'minion', uid: 300 } },
  { type: 'hero_attack', target: { kind: 'hero' } },
  { type: 'hero_attack', target: { kind: 'minion', uid: 4 } },
  { type: 'hero_ability' },
  { type: 'hero_ability', targetUid: 12 },
  { type: 'place', handIndex: 3 },
  { type: 'activate', holdingUid: 8 },
  { type: 'activate', holdingUid: 8, targetUid: 12 },
  { type: 'end_turn' },
  { type: 'surrender' },
  { type: 'place', handIndex: 3 },
  { type: 'activate', holdingUid: 8 },
  { type: 'activate', holdingUid: 8, targetUid: 12 },
  { type: 'set', handIndex: 1 },
  { type: 'swear', handIndex: 2 },
]

const raw = (...bytes: number[]): Uint8Array => new Uint8Array(bytes)

const outcome = (data: Uint8Array): 'ok' | ProtocolErrorCode => {
  try {
    decodeCommandFrame(data)
    return 'ok'
  } catch (error) {
    if (error instanceof ProtocolError) return error.code
    throw error
  }
}

describe('command frames', () => {
  test('schema ids are unique and stable', () => {
    const ids = Object.values(COMMAND_SCHEMAS).map((schema) => schema.id)
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  test('encode and decode match golden vectors', () => {
    const play: Command = { type: 'play', handIndex: 2, position: 0 }
    expect(Array.from(encodeCommandFrame(5, 'a1', play))).toEqual([0xae, 0x01, 0x00, 0x01, 0x05, 0x06, 0x02, 0x61, 0x31, 0x02, 0x00, 0x00])

    const attack: Command = { type: 'attack', attackerUid: 3, target: { kind: 'minion', uid: 300 } }
    const attackBytes = [0xae, 0x01, 0x00, 0x04, 0x82, 0x01, 0x07, 0x01, 0x6b, 0x03, 0x01, 0x01, 0xac, 0x02]
    expect(Array.from(encodeCommandFrame(130, 'k', attack))).toEqual(attackBytes)
    expect(decodeCommandFrame(raw(...attackBytes))).toEqual({ sequence: 130, commandId: 'k', command: attack })

    const endTurnBytes = [0xae, 0x01, 0x00, 0x07, 0x00, 0x02, 0x01, 0x7a]
    expect(Array.from(encodeCommandFrame(0, 'z', { type: 'end_turn' }))).toEqual(endTurnBytes)
  })

  test('every command type round trips', () => {
    COMMANDS.forEach((command, index) => {
      const commandId = `cmd-${index}`
      expect(decodeCommandFrame(encodeCommandFrame(index, commandId, command))).toEqual({ sequence: index, commandId, command })
    })
  })

  test('rejects bad headers', () => {
    expect(outcome(raw())).toBe('truncated')
    expect(outcome(raw(0x00, 0x01, 0x00, 0x07, 0x00, 0x02, 0x01, 0x7a))).toBe('malformed')
    expect(outcome(raw(0xae, 0x02, 0x00, 0x07, 0x00, 0x02, 0x01, 0x7a))).toBe('unsupported')
    expect(outcome(raw(0xae, 0x01, 0x01, 0x07, 0x00, 0x02, 0x01, 0x7a))).toBe('unsupported')
    expect(outcome(raw(0xae, 0x01, 0x00, 99, 0x00, 0x00))).toBe('unsupported')
  })

  test('rejects bad lengths', () => {
    expect(outcome(raw(0xae, 0x01, 0x00, 0x07, 0x00, 0x09, 0x01, 0x7a))).toBe('truncated')
    expect(outcome(raw(0xae, 0x01, 0x00, 0x07, 0x00, 0x02, 0x01, 0x7a, 0x00))).toBe('malformed')
    expect(outcome(raw(0xae, 0x01, 0x00, 0x07, 0x00, 0x03, 0x01, 0x7a, 0x00))).toBe('malformed')
    expect(outcome(raw(0xae, 0x01, 0x00, 0x07, 0x00, 0xac, 0x02))).toBe('too_large')
    expect(outcome(new Uint8Array(PROTOCOL.maxCommandPayload + PROTOCOL.maxHeaderBytes + 1))).toBe('too_large')
  })

  test('rejects bad field values', () => {
    expect(outcome(raw(0xae, 0x01, 0x00, 0x01, 0x00, 0x05, 0x01, 0x61, 0x00, 0x00, 0x02))).toBe('malformed')
    expect(outcome(raw(0xae, 0x01, 0x00, 0x05, 0x00, 0x05, 0x01, 0x61, 0x00, 0x01, 0x05))).toBe('malformed')
    expect(outcome(raw(0xae, 0x01, 0x00, 0x05, 0x00, 0x04, 0x01, 0x61, 0x01, 0x00))).toBe('malformed')
    expect(outcome(raw(0xae, 0x01, 0x00, 0x05, 0x00, 0x04, 0x01, 0x61, 0x02, 0x00))).toBe('malformed')
    expect(outcome(raw(0xae, 0x01, 0x00, 0x07, 0x00, 0x02, 0x01, 0xff))).toBe('malformed')
    expect(outcome(raw(0xae, 0x01, 0x00, 0x07, 0x00, 66, 65, ...new Array<number>(65).fill(0x41)))).toBe('too_large')
  })

  test('random bytes only ever produce protocol errors', () => {
    const rng = new Rng(2026)
    for (let round = 0; round < 3000; round += 1) {
      const data = new Uint8Array(rng.nextInt(40))
      for (let index = 0; index < data.length; index += 1) data[index] = rng.nextInt(256)
      outcome(data)
    }
  })

  test('mutated valid frames only ever produce protocol errors', () => {
    const rng = new Rng(77)
    COMMANDS.forEach((command, index) => {
      const frame = encodeCommandFrame(index, `cmd-${index}`, command)
      for (let round = 0; round < 200; round += 1) {
        const mutated = frame.slice(0, rng.nextInt(frame.length + 1))
        if (mutated.length > 0 && rng.nextInt(4) > 0) mutated[rng.nextInt(mutated.length)] = rng.nextInt(256)
        outcome(mutated)
      }
    })
  })

  test('a decoded frame drives a match session', () => {
    const session = new MatchSession(fixtureSetup(1))
    const decoded = decodeCommandFrame(encodeCommandFrame(1, 'turn-1', { type: 'end_turn' }))
    expect(session.submit(0, decoded.commandId, decoded.command)).toMatchObject({ ok: true, duplicate: false })
    expect(session.inspect().active).toBe(1)
  })
})