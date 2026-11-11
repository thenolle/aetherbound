import type { MatchView, ViewEvent } from '../rules/projection'
import type { SequencedViewEvent } from '../rules/session'
import type { AttackTarget, Holding, Minion, Oath, PlayerIndex, PlayerState, Snare, Weapon } from '../rules/types'
import type { Effect, EffectTarget } from '../shared/effects'
import { ERROR_CODES } from '../shared/errors'
import type { ErrorCode } from '../shared/errors'
import { parseId } from '../shared/ids'
import type { Id } from '../shared/ids'
import { KEYWORD_IDS } from '../shared/lexicon'
import type { KeywordId } from '../shared/lexicon'
import { ByteReader, ByteWriter } from './bytes'
import { ProtocolError } from './errors'
import { readFrame, writeFrame } from './frame'

export type ServerMessage =
  | Readonly<{ type: 'snapshot', seq: number, view: MatchView }>
  | Readonly<{ type: 'events', events: readonly SequencedViewEvent[] }>
  | Readonly<{ type: 'accepted', commandSequence: number, duplicate: boolean, lastSeq: number }>
  | Readonly<{ type: 'rejected', commandSequence: number, code: ErrorCode, message: string }>

export type DecodedServerFrame = Readonly<{ sequence: number, message: ServerMessage }>

export const SERVER_PAYLOAD_MAX = 32768
export const MAX_EVENTS_PER_MESSAGE = 128

const MAX_LIST = 32
const MAX_ID_BYTES = 64
const MAX_MESSAGE_BYTES = 120

export const MESSAGE_IDS = { snapshot: 16, events: 17, accepted: 18, rejected: 19 } as const satisfies Record<ServerMessage['type'], number>

export const EVENT_IDS = {
  turn_started: 1,
  turn_timed_out: 2,
  card_drawn: 3,
  card_burned: 4,
  fatigue: 5,
  minion_played: 6,
  writ_cast: 7,
  iron_equipped: 8,
  iron_broken: 9,
  ability_used: 10,
  attacked: 11,
  hero_attacked: 12,
  damaged: 13,
  healed: 14,
  taxed: 15,
  minion_died: 16,
  surrendered: 17,
  game_over: 18,
  holding_placed: 19,
  holding_activated: 20,
  holding_destroyed: 21,
  snare_set: 22,
  snare_sprung: 23,
  oath_sworn: 24,
  oath_progress: 25,
  oath_fulfilled: 26,
  frozen: 27,
} as const satisfies Record<ViewEvent['type'], number>

const MESSAGE_TYPE_BY_ID = new Map<number, ServerMessage['type']>((Object.keys(MESSAGE_IDS) as ServerMessage['type'][]).map((type) => [MESSAGE_IDS[type], type]))
const EVENT_TYPE_BY_ID = new Map<number, ViewEvent['type']>((Object.keys(EVENT_IDS) as ViewEvent['type'][]).map((type) => [EVENT_IDS[type], type]))
const EFFECT_TARGETS: readonly EffectTarget[] = ['enemy-hero', 'own-hero', 'chosen-enemy-minion', 'all-enemy-minions']

type SharedSide = Omit<PlayerState, 'deck' | 'hand' | 'snares'> & { deckCount: number }

const malformed = (message: string): ProtocolError => new ProtocolError('malformed', message)
function writeBool(w: ByteWriter, value: boolean): void { w.u8(value ? 1 : 0) }

function readBool(r: ByteReader): boolean {
  const value = r.u8()
  if (value > 1) throw malformed('invalid boolean')
  return value === 1
}

function readPlayer(r: ByteReader): PlayerIndex {
  const value = r.u8()
  if (value !== 0 && value !== 1) throw malformed('invalid player')
  return value
}

function readWinner(r: ByteReader): PlayerIndex | null {
  const value = r.u8()
  if (value === 0) return null
  if (value === 1) return 0
  if (value === 2) return 1
  throw malformed('invalid winner')
}

const winnerByte = (winner: PlayerIndex | null): number => (winner === null ? 0 : winner + 1)

function writeId(w: ByteWriter, id: string): void { w.string(id, MAX_ID_BYTES) }
function readId<K extends 'card' | 'hero'>(r: ByteReader, kind: K): Id<K> {
  const raw = r.string(MAX_ID_BYTES)
  try { return parseId(kind, raw) } catch { throw malformed(`invalid ${kind} id`) }
}

function writeOptUid(w: ByteWriter, uid: number | null): void {
  if (uid === null) {
    w.u8(0)
    return
  }
  w.u8(1)
  w.varuint(uid)
}

function readOptUid(r: ByteReader): number | null {
  const present = r.u8()
  if (present === 0) return null
  if (present === 1) return r.varuint()
  throw malformed('invalid presence byte')
}

function writeOptCard(w: ByteWriter, id: Id<'card'> | null): void {
  if (id === null) {
    w.u8(0)
    return
  }
  w.u8(1)
  writeId(w, id)
}

function readOptCard(r: ByteReader): Id<'card'> | null {
  const present = r.u8()
  if (present === 0) return null
  if (present === 1) return readId(r, 'card')
  throw malformed('invalid presence byte')
}

function writeList<T>(w: ByteWriter, items: readonly T[], write: (item: T) => void): void {
  if (items.length > MAX_LIST) throw new ProtocolError('too_large', 'list is too long')
  w.varuint(items.length)
  for (const item of items) write(item)
}

function readList<T>(r: ByteReader, read: () => T): T[] {
  const count = r.varuint()
  if (count > MAX_LIST) throw new ProtocolError('too_large', 'list is too long')
  const items: T[] = []
  for (let index = 0; index < count; index += 1) items.push(read())
  return items
}

function writeTarget(w: ByteWriter, target: AttackTarget): void {
  if (target.kind === 'hero') {
    w.u8(0)
    return
  }
  w.u8(1)
  w.varuint(target.uid)
}

function readTarget(r: ByteReader): AttackTarget {
  const kind = r.u8()
  if (kind === 0) return { kind: 'hero' }
  if (kind === 1) return { kind: 'minion', uid: r.varuint() }
  throw malformed('invalid target kind')
}

function writeEffect(w: ByteWriter, effect: Effect): void {
  switch (effect.kind) {
    case 'damage':
    case 'heal':
      w.u8(effect.kind === 'damage' ? 0 : 1)
      w.varuint(effect.amount)
      w.u8(EFFECT_TARGETS.indexOf(effect.target))
      return
    case 'freeze':
      w.u8(4)
      w.u8(EFFECT_TARGETS.indexOf(effect.target))
      return
    case 'draw':
      w.u8(2)
      w.varuint(effect.count)
      return
    case 'tariff':
      w.u8(3)
      w.varuint(effect.amount)
      return
  }
}

function readEffect(r: ByteReader): Effect {
  const kind = r.u8()
  if (kind === 0 || kind === 1) {
    const amount = r.varuint()
    const target = EFFECT_TARGETS[r.u8()]
    if (target === undefined) throw malformed('invalid effect target')
    return { kind: kind === 0 ? 'damage' : 'heal', amount, target }
  }
  if (kind === 2) return { kind: 'draw', count: r.varuint() }
  if (kind === 3) return { kind: 'tariff', amount: r.varuint() }
  if (kind === 4) {
    const target = EFFECT_TARGETS[r.u8()]
    if (target === undefined) throw malformed('invalid effect target')
    return { kind: 'freeze', target }
  }
  throw malformed('invalid effect kind')
}

function writeMinion(w: ByteWriter, minion: Minion): void {
  w.varuint(minion.uid)
  writeId(w, minion.cardId)
  w.varuint(minion.attack)
  w.varint(minion.health)
  w.varuint(minion.maxHealth)
  writeBool(w, minion.exhausted)
  writeBool(w, minion.frozen === true)
  writeList(w, minion.keywords, (keyword) => w.u8(KEYWORD_IDS.indexOf(keyword)))
  writeList(w, minion.onDeath, (effect) => writeEffect(w, effect))
}

function readMinion(r: ByteReader): Minion {
  const uid = r.varuint()
  const cardId = readId(r, 'card')
  const attack = r.varuint()
  const health = r.varint()
  const maxHealth = r.varuint()
  const exhausted = readBool(r)
  const frozen = readBool(r)
  const keywords = readList<KeywordId>(r, () => {
    const keyword = KEYWORD_IDS[r.u8()]
    if (keyword === undefined) throw malformed('invalid keyword')
    return keyword
  })
  const onDeath = readList(r, () => readEffect(r))
  return { uid, cardId, attack, health, maxHealth, exhausted, ...(frozen ? { frozen: true } : {}), keywords, onDeath }
}

function writeWeapon(w: ByteWriter, weapon: Weapon | null): void {
  if (weapon === null) {
    w.u8(0)
    return
  }
  w.u8(1)
  writeId(w, weapon.cardId)
  w.varuint(weapon.attack)
  w.varuint(weapon.durability)
}

function readWeapon(r: ByteReader): Weapon | null {
  const present = r.u8()
  if (present === 0) return null
  if (present !== 1) throw malformed('invalid presence byte')
  return { cardId: readId(r, 'card'), attack: r.varuint(), durability: r.varuint() }
}

function writeHolding(w: ByteWriter, holding: Holding): void {
  w.varuint(holding.uid)
  writeId(w, holding.cardId)
  w.varuint(holding.charges)
  writeBool(w, holding.used)
}

function readHolding(r: ByteReader): Holding {
  const uid = r.varuint()
  const cardId = readId(r, 'card')
  const charges = r.varuint()
  const used = readBool(r)
  return { uid, cardId, charges, used }
}

function writeSnare(w: ByteWriter, snare: Snare): void {
  w.varuint(snare.uid)
  writeId(w, snare.cardId)
}

function readSnare(r: ByteReader): Snare {
  const uid = r.varuint()
  const cardId = readId(r, 'card')
  return { uid, cardId }
}

function writeOath(w: ByteWriter, oath: Oath): void {
  w.varuint(oath.uid)
  writeId(w, oath.cardId)
  w.varuint(oath.progress)
  w.varuint(oath.goal)
}

function readOath(r: ByteReader): Oath {
  const uid = r.varuint()
  const cardId = readId(r, 'card')
  const progress = r.varuint()
  const goal = r.varuint()
  return { uid, cardId, progress, goal }
}

function writeSide(w: ByteWriter, side: SharedSide): void {
  writeId(w, side.heroId)
  w.varint(side.heroHealth)
  w.varuint(side.heroMaxHealth)
  w.varuint(side.aetherMax)
  w.varuint(side.aether)
  w.varuint(side.tariff)
  w.varuint(side.fatigue)
  writeWeapon(w, side.weapon)
  writeList(w, side.holdings, (holding) => writeHolding(w, holding))
  writeList(w, side.oaths, (oath) => writeOath(w, oath))
  writeBool(w, side.heroAttacked)
  w.varuint(side.ability.cost)
  writeList(w, side.ability.effects, (effect) => writeEffect(w, effect))
  writeBool(w, side.abilityUsed)
  w.varuint(side.deckCount)
  writeList(w, side.board, (minion) => writeMinion(w, minion))
}

function readSide(r: ByteReader): SharedSide {
  const heroId = readId(r, 'hero')
  const heroHealth = r.varint()
  const heroMaxHealth = r.varuint()
  const aetherMax = r.varuint()
  const aether = r.varuint()
  const tariff = r.varuint()
  const fatigue = r.varuint()
  const weapon = readWeapon(r)
  const holdings = readList(r, () => readHolding(r))
  const oaths = readList(r, () => readOath(r))
  const heroAttacked = readBool(r)
  const cost = r.varuint()
  const effects = readList(r, () => readEffect(r))
  const abilityUsed = readBool(r)
  const deckCount = r.varuint()
  const board = readList(r, () => readMinion(r))
  return {
    heroId,
    heroHealth,
    heroMaxHealth,
    aetherMax,
    aether,
    tariff,
    fatigue,
    weapon,
    holdings,
    oaths,
    heroAttacked,
    ability: { cost, effects },
    abilityUsed,
    deckCount,
    board
  }
}

function writeView(w: ByteWriter, view: MatchView): void {
  w.varuint(view.rulesVersion)
  w.varuint(view.turn)
  w.u8(view.active)
  w.u8(winnerByte(view.winner))
  w.u8(view.viewer)
  writeSide(w, view.self)
  writeList(w, view.self.hand, (cardId) => writeId(w, cardId))
  writeList(w, view.self.snares, (snare) => writeSnare(w, snare))
  writeSide(w, view.opponent)
  w.varuint(view.opponent.handCount)
  w.varuint(view.opponent.snareCount)
}

function readView(r: ByteReader): MatchView {
  const rulesVersion = r.varuint()
  const turn = r.varuint()
  const active = readPlayer(r)
  const winner = readWinner(r)
  const viewer = readPlayer(r)
  const selfSide = readSide(r)
  const hand = readList(r, () => readId(r, 'card'))
  const snares = readList(r, () => readSnare(r))
  const foeSide = readSide(r)
  const handCount = r.varuint()
  const snareCount = r.varuint()
  return {
    rulesVersion,
    turn,
    active,
    winner,
    viewer,
    self: { ...selfSide, hand, snares },
    opponent: { ...foeSide, handCount, snareCount }
  }
}

function writeEvent(w: ByteWriter, event: ViewEvent): void {
  w.u8(EVENT_IDS[event.type])
  switch (event.type) {
    case 'turn_started':
      w.u8(event.player)
      w.varuint(event.turn)
      w.varuint(event.aether)
      return
    case 'turn_timed_out':
    case 'iron_broken':
    case 'ability_used':
    case 'surrendered':
      w.u8(event.player)
      return
    case 'card_drawn':
      w.u8(event.player)
      writeOptCard(w, event.cardId)
      return
    case 'card_burned':
    case 'writ_cast':
      w.u8(event.player)
      writeId(w, event.cardId)
      return
    case 'fatigue':
      w.u8(event.player)
      w.varuint(event.damage)
      return
    case 'minion_played':
      w.u8(event.player)
      w.varuint(event.uid)
      writeId(w, event.cardId)
      w.varuint(event.position)
      return
    case 'iron_equipped':
      w.u8(event.player)
      writeId(w, event.cardId)
      w.varuint(event.attack)
      w.varuint(event.durability)
      return
    case 'holding_placed':
      w.u8(event.player)
      w.varuint(event.uid)
      writeId(w, event.cardId)
      w.varuint(event.charges)
      return
    case 'holding_activated':
    case 'holding_destroyed':
      w.u8(event.player)
      w.varuint(event.uid)
      return
    case 'snare_set':
      w.u8(event.player)
      w.varuint(event.uid)
      writeOptCard(w, event.cardId)
      return
    case 'snare_sprung':
      w.u8(event.player)
      w.varuint(event.uid)
      writeId(w, event.cardId)
      return
    case 'oath_sworn':
      w.u8(event.player)
      w.varuint(event.uid)
      writeId(w, event.cardId)
      w.varuint(event.goal)
      return
    case 'oath_progress':
      w.u8(event.player)
      w.varuint(event.uid)
      w.varuint(event.progress)
      return
    case 'oath_fulfilled':
      w.u8(event.player)
      w.varuint(event.uid)
      return
    case 'frozen':
      w.u8(event.player)
      w.varuint(event.uid)
      return
    case 'attacked':
      w.u8(event.player)
      w.varuint(event.attackerUid)
      writeTarget(w, event.target)
      return
    case 'hero_attacked':
      w.u8(event.player)
      writeTarget(w, event.target)
      return
    case 'damaged':
    case 'healed':
      w.u8(event.player)
      writeOptUid(w, event.uid)
      w.varuint(event.amount)
      return
    case 'taxed':
      w.u8(event.player)
      w.varuint(event.amount)
      return
    case 'minion_died':
      w.u8(event.player)
      w.varuint(event.uid)
      return
    case 'game_over':
      w.u8(event.winner)
      return
  }
}

function readEvent(r: ByteReader): ViewEvent {
  const type = EVENT_TYPE_BY_ID.get(r.u8())
  if (type === undefined) throw new ProtocolError('unsupported', 'unknown event id')
  switch (type) {
    case 'turn_started':
      return { type, player: readPlayer(r), turn: r.varuint(), aether: r.varuint() }
    case 'turn_timed_out':
    case 'iron_broken':
    case 'ability_used':
    case 'surrendered':
      return { type, player: readPlayer(r) }
    case 'card_drawn':
      return { type, player: readPlayer(r), cardId: readOptCard(r) }
    case 'card_burned':
    case 'writ_cast':
      return { type, player: readPlayer(r), cardId: readId(r, 'card') }
    case 'fatigue':
      return { type, player: readPlayer(r), damage: r.varuint() }
    case 'minion_played':
      return { type, player: readPlayer(r), uid: r.varuint(), cardId: readId(r, 'card'), position: r.varuint() }
    case 'iron_equipped':
      return { type, player: readPlayer(r), cardId: readId(r, 'card'), attack: r.varuint(), durability: r.varuint() }
    case 'holding_placed':
      return { type, player: readPlayer(r), uid: r.varuint(), cardId: readId(r, 'card'), charges: r.varuint() }
    case 'holding_activated':
    case 'holding_destroyed':
      return { type, player: readPlayer(r), uid: r.varuint() }
    case 'snare_set':
      return { type, player: readPlayer(r), uid: r.varuint(), cardId: readOptCard(r) }
    case 'snare_sprung':
      return { type, player: readPlayer(r), uid: r.varuint(), cardId: readId(r, 'card') }
    case 'oath_sworn':
      return { type, player: readPlayer(r), uid: r.varuint(), cardId: readId(r, 'card'), goal: r.varuint() }
    case 'oath_progress':
      return { type, player: readPlayer(r), uid: r.varuint(), progress: r.varuint() }
    case 'oath_fulfilled':
      return { type, player: readPlayer(r), uid: r.varuint() }
    case 'attacked':
      return { type, player: readPlayer(r), attackerUid: r.varuint(), target: readTarget(r) }
    case 'hero_attacked':
      return { type, player: readPlayer(r), target: readTarget(r) }
    case 'damaged':
    case 'healed':
      return { type, player: readPlayer(r), uid: readOptUid(r), amount: r.varuint() }
    case 'taxed':
      return { type, player: readPlayer(r), amount: r.varuint() }
    case 'minion_died':
      return { type, player: readPlayer(r), uid: r.varuint() }
    case 'game_over':
      return { type, winner: readPlayer(r) }
    case 'frozen':
      return { type, player: readPlayer(r), uid: r.varuint() }
  }
}

function readMessage(type: ServerMessage['type'], r: ByteReader): ServerMessage {
  switch (type) {
    case 'snapshot':
      return { type, seq: r.varuint(), view: readView(r) }
    case 'events': {
      const count = r.varuint()
      if (count > MAX_EVENTS_PER_MESSAGE) throw new ProtocolError('too_large', 'too many events')
      const events: SequencedViewEvent[] = []
      for (let index = 0; index < count; index += 1) events.push({ seq: r.varuint(), event: readEvent(r) })
      return { type, events }
    }
    case 'accepted':
      return { type, commandSequence: r.varuint(), duplicate: readBool(r), lastSeq: r.varuint() }
    case 'rejected': {
      const commandSequence = r.varuint()
      const code = ERROR_CODES[r.u8()]
      if (code === undefined) throw malformed('invalid error code')
      return { type, commandSequence, code, message: r.string(MAX_MESSAGE_BYTES) }
    }
  }
}

export function encodeServerFrame(sequence: number, message: ServerMessage): Uint8Array {
  const body = new ByteWriter(SERVER_PAYLOAD_MAX)
  switch (message.type) {
    case 'snapshot':
      body.varuint(message.seq)
      writeView(body, message.view)
      break
    case 'events':
      if (message.events.length > MAX_EVENTS_PER_MESSAGE) throw new ProtocolError('too_large', 'too many events')
      body.varuint(message.events.length)
      for (const item of message.events) {
        body.varuint(item.seq)
        writeEvent(body, item.event)
      }
      break
    case 'accepted':
      body.varuint(message.commandSequence)
      writeBool(body, message.duplicate)
      body.varuint(message.lastSeq)
      break
    case 'rejected':
      body.varuint(message.commandSequence)
      body.u8(ERROR_CODES.indexOf(message.code))
      body.string(message.message, MAX_MESSAGE_BYTES)
      break
  }
  return writeFrame(MESSAGE_IDS[message.type], sequence, body.finish(), SERVER_PAYLOAD_MAX)
}

export function decodeServerFrame(data: Uint8Array): DecodedServerFrame {
  const frame = readFrame(data, SERVER_PAYLOAD_MAX, (id) => MESSAGE_TYPE_BY_ID.has(id))
  const type = MESSAGE_TYPE_BY_ID.get(frame.id)
  if (type === undefined) throw new ProtocolError('unsupported', 'unknown message id')
  const message = readMessage(type, frame.body)
  frame.body.expectEnd()
  return { sequence: frame.sequence, message }
}