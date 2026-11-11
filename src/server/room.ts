import { decodeCommandFrame } from '../protocol/commands'
import { ProtocolError } from '../protocol/errors'
import { MAX_EVENTS_PER_MESSAGE, encodeServerFrame } from '../protocol/server'
import type { ServerMessage } from '../protocol/server'
import { describeMatch } from '../persistence/match-store'
import type { MatchRecorder } from '../persistence/match-store'
import { RULES } from '../rules/constants'
import type { MatchSetup } from '../rules/engine'
import { MatchSession } from '../rules/session'
import type { PlayerIndex } from '../rules/types'
import type { ErrorCode } from '../shared/errors'
import { TokenBucket } from './ratelimit'

export type SeatLink = Readonly<{
  send: (data: Uint8Array) => void
  close: (code: number, reason: string) => void
}>

export type RoomOptions = Readonly<{
  turnMs: number
  burst: number
  refillPerSecond: number
  now: () => number
  schedule: (run: () => void, ms: number) => () => void
}>

export type RoomPersistence = Readonly<{
  matchId: string
  recorder: MatchRecorder
  accounts?: readonly [string | null, string | null]
}>

export const DEFAULT_ROOM_OPTIONS: RoomOptions = {
  turnMs: RULES.turnSeconds * 1000,
  burst: 20,
  refillPerSecond: 10,
  now: () => Date.now(),
  schedule: (run, ms) => {
    const handle = setTimeout(run, ms)
    return () => clearTimeout(handle)
  }
}

const SEATS = [0, 1] as const

export class Room {
  private readonly session: MatchSession
  private readonly options: RoomOptions
  private readonly persistence: RoomPersistence | null
  private readonly links: [SeatLink | null, SeatLink | null] = [null, null]
  private readonly delivered: [number, number] = [0, 0]
  private readonly outbound: [number, number] = [0, 0]
  private readonly inbound: [number, number] = [-1, -1]
  private readonly buckets: [TokenBucket, TokenBucket]
  private cancelTimer: (() => void) | null = null
  private persisted = 0
  private failed = false

  constructor(setup: MatchSetup, options: RoomOptions = DEFAULT_ROOM_OPTIONS, persistence: RoomPersistence | null = null) {
    this.session = new MatchSession(setup)
    this.options = options
    this.persistence = persistence
    this.buckets = [this.newBucket(), this.newBucket()]
    if (persistence !== null) persistence.recorder.begin(describeMatch(persistence.matchId, setup, options.now(), persistence.accounts))
  }

  get winner(): PlayerIndex | null {
    return this.session.winner
  }

  attach(seat: PlayerIndex, link: SeatLink): void {
    if (this.failed) {
      link.close(1011, 'room unavailable')
      return
    }
    const previous = this.links[seat]
    this.links[seat] = link
    this.inbound[seat] = -1
    this.outbound[seat] = 0
    this.buckets[seat] = this.newBucket()
    if (previous !== null) previous.close(4000, 'replaced by a newer connection')
    this.sendSnapshot(seat)
    if (this.cancelTimer === null) this.arm()
  }

  detach(seat: PlayerIndex, link: SeatLink): void {
    if (this.links[seat] === link) this.links[seat] = null
  }

  handleFrame(seat: PlayerIndex, link: SeatLink, data: Uint8Array): void {
    if (this.links[seat] !== link || this.failed) return

    let decoded
    try {
      decoded = decodeCommandFrame(data)
    } catch (error) {
      if (error instanceof ProtocolError) {
        link.close(4400, 'malformed frame')
        return
      }
      throw error
    }

    if (!this.buckets[seat].take()) {
      this.reject(seat, decoded.sequence, 'rate_limited', 'too many commands')
      return
    }
    if (decoded.sequence <= this.inbound[seat]) {
      this.reject(seat, decoded.sequence, 'invalid_command', 'stale or repeated sequence')
      return
    }
    this.inbound[seat] = decoded.sequence

    const result = this.session.submit(seat, decoded.commandId, decoded.command)
    if (!result.ok) {
      this.reject(seat, decoded.sequence, result.code, result.message)
      return
    }
    if (!result.duplicate && !this.persist()) {
      this.reject(seat, decoded.sequence, 'internal', 'persistence failure')
      this.abort()
      return
    }
    this.send(seat, { type: 'accepted', commandSequence: decoded.sequence, duplicate: result.duplicate, lastSeq: result.lastSeq })
    if (!result.duplicate) {
      this.broadcast()
      this.arm()
    }
  }

  dispose(): void {
    this.disarm()
    for (const seat of SEATS) {
      this.links[seat]?.close(1001, 'room closed')
      this.links[seat] = null
    }
  }

  private newBucket(): TokenBucket {
    return new TokenBucket(this.options.burst, this.options.refillPerSecond, this.options.now)
  }

  private persist(): boolean {
    const persistence = this.persistence
    if (persistence === null) return true
    try {
      const fresh = this.session.inputsFrom(this.persisted)
      if (fresh.length === 0) return true
      const winner = this.session.winner
      const outcome = winner === null ? null : { winner, endedAt: this.options.now() }
      persistence.recorder.append(persistence.matchId, this.persisted, fresh, outcome)
      this.persisted += fresh.length
      return true
    } catch (error) {
      console.error('match persistence failed', error)
      return false
    }
  }

  private abort(): void {
    this.failed = true
    this.disarm()
    for (const seat of SEATS) this.links[seat]?.close(1011, 'persistence failure')
  }

  private reject(seat: PlayerIndex, commandSequence: number, code: ErrorCode, message: string): void {
    this.send(seat, { type: 'rejected', commandSequence, code, message: message.slice(0, 120) })
  }

  private send(seat: PlayerIndex, message: ServerMessage): void {
    const link = this.links[seat]
    if (link === null) return
    try {
      link.send(encodeServerFrame(this.outbound[seat], message))
      this.outbound[seat] += 1
    } catch (error) {
      if (error instanceof ProtocolError) {
        link.close(1011, 'server encoding error')
        return
      }
      throw error
    }
  }

  private sendSnapshot(seat: PlayerIndex): void {
    const { seq, view } = this.session.view(seat)
    this.delivered[seat] = seq
    this.send(seat, { type: 'snapshot', seq, view })
  }

  private broadcast(): void {
    for (const seat of SEATS) {
      if (this.links[seat] === null) continue
      const events = this.session.eventsFor(seat, this.delivered[seat])
      for (let start = 0; start < events.length; start += MAX_EVENTS_PER_MESSAGE) {
        this.send(seat, { type: 'events', events: events.slice(start, start + MAX_EVENTS_PER_MESSAGE) })
      }
      this.sendSnapshot(seat)
    }
  }

  private arm(): void {
    this.disarm()
    if (this.session.winner !== null) return
    this.cancelTimer = this.options.schedule(() => this.expire(), this.options.turnMs)
  }

  private disarm(): void {
    this.cancelTimer?.()
    this.cancelTimer = null
  }

  private expire(): void {
    this.cancelTimer = null
    if (this.session.timeout().ok) {
      if (!this.persist()) {
        this.abort()
        return
      }
      this.broadcast()
    }
    this.arm()
  }
}