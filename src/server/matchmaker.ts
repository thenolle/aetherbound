import type { MatchSetup } from '../rules/engine'
import type { PlayerIndex } from '../rules/types'
import type { RoomRegistry } from './rooms'

export type QueueStatus =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'waiting' }>
  | Readonly<{ status: 'matched', seat: PlayerIndex, token: string }>

export type MatchmakerOptions = Readonly<{ coin?: () => boolean, maxWaitMs?: number }>

type Waiting = { accountId: string, since: number }

const DEFAULT_MAX_WAIT_MS = 300_000
const defaultCoin = (): boolean => (crypto.getRandomValues(new Uint8Array(1))[0] ?? 0) % 2 === 0

export class Matchmaker {
  private readonly waiting: Waiting[] = []
  private readonly rooms: RoomRegistry
  private readonly makeSetup: (accounts: readonly [string, string]) => MatchSetup
  private readonly now: () => number
  private readonly coin: () => boolean
  private readonly maxWaitMs: number

  constructor(rooms: RoomRegistry, makeSetup: (accounts: readonly [string, string]) => MatchSetup, now: () => number, options: MatchmakerOptions = {}) {
    this.rooms = rooms
    this.makeSetup = makeSetup
    this.now = now
    this.coin = options.coin ?? defaultCoin
    this.maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS
  }

  status(accountId: string): QueueStatus {
    const current = this.rooms.currentFor(accountId)
    if (current !== null) return { status: 'matched', seat: current.seat, token: current.token }
    return this.waiting.some((entry) => entry.accountId === accountId) ? { status: 'waiting' } : { status: 'idle' }
  }

  join(accountId: string): QueueStatus {
    const queued = this.waiting.some((entry) => entry.accountId === accountId)
    if (!queued && this.rooms.currentFor(accountId) === null) this.waiting.push({ accountId, since: this.now() })
    this.pair()
    return this.status(accountId)
  }

  leave(accountId: string): void {
    const index = this.waiting.findIndex((entry) => entry.accountId === accountId)
    if (index >= 0) this.waiting.splice(index, 1)
  }

  sweep(): number {
    const limit = this.now() - this.maxWaitMs
    let removed = 0
    for (let index = this.waiting.length - 1; index >= 0; index -= 1) {
      if ((this.waiting[index]?.since ?? limit + 1) <= limit) {
        this.waiting.splice(index, 1)
        removed += 1
      }
    }
    return removed
  }

  private pair(): void {
    while (this.waiting.length >= 2) {
      const first = this.waiting.shift()
      const second = this.waiting.shift()
      if (first === undefined || second === undefined) return
      const pair: readonly [string, string] = this.coin() ? [first.accountId, second.accountId] : [second.accountId, first.accountId]
      this.rooms.openMatch(pair, () => this.makeSetup(pair))
    }
  }
}