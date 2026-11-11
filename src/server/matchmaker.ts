import type { MatchMode } from '../persistence/match-store'
import type { MatchSetup } from '../rules/engine'
import type { PlayerIndex } from '../rules/types'
import { DEFAULT_ROOM_OPTIONS } from './room'
import type { RoomRegistry } from './rooms'

export type QueueStatus =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'waiting' }>
  | Readonly<{ status: 'matched', seat: PlayerIndex, token: string }>

export type MatchmakerOptions = Readonly<{
  coin?: () => boolean
  maxWaitMs?: number
  ratingOf?: (accountId: string) => number
}>

type Waiting = { accountId: string, mode: MatchMode, since: number, mmr: number }

const DEFAULT_MAX_WAIT_MS = 300_000
const DEFAULT_MMR = 1000
const RANKED_BASE_WINDOW = 100
const RANKED_WINDOW_GROWTH = 50
const RANKED_WINDOW_STEP_MS = 10_000
const RANKED_MAX_WINDOW = 1000
const defaultCoin = (): boolean => (crypto.getRandomValues(new Uint8Array(1))[0] ?? 0) % 2 === 0

export class Matchmaker {
  private readonly waiting: Waiting[] = []
  private readonly rooms: RoomRegistry
  private readonly makeSetup: (accounts: readonly [string, string]) => MatchSetup
  private readonly now: () => number
  private readonly coin: () => boolean
  private readonly maxWaitMs: number
  private readonly ratingOf: (accountId: string) => number

  constructor(rooms: RoomRegistry, makeSetup: (accounts: readonly [string, string]) => MatchSetup, now: () => number, options: MatchmakerOptions = {}) {
    this.rooms = rooms
    this.makeSetup = makeSetup
    this.now = now
    this.coin = options.coin ?? defaultCoin
    this.maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS
    this.ratingOf = options.ratingOf ?? (() => DEFAULT_MMR)
  }

  queueSizes(): Readonly<{ casual: number, ranked: number }> {
    return {
      casual: this.waiting.filter((entry) => entry.mode === 'casual').length,
      ranked: this.waiting.filter((entry) => entry.mode === 'ranked').length
    }
  }

  status(accountId: string): QueueStatus {
    const current = this.rooms.currentFor(accountId)
    if (current !== null) return { status: 'matched', seat: current.seat, token: current.token }
    return this.waiting.some((entry) => entry.accountId === accountId) ? { status: 'waiting' } : { status: 'idle' }
  }

  join(accountId: string, mode: MatchMode = 'casual'): QueueStatus {
    if (this.waiting.some((entry) => entry.accountId === accountId && entry.mode !== mode)) this.leave(accountId)
    const queued = this.waiting.some((entry) => entry.accountId === accountId)
    if (!queued && this.rooms.currentFor(accountId) === null) {
      this.waiting.push({ accountId, mode, since: this.now(), mmr: this.ratingOf(accountId) })
    }
    this.pair()
    return this.status(accountId)
  }

  leave(accountId: string): void {
    const index = this.waiting.findIndex((entry) => entry.accountId === accountId)
    if (index >= 0) this.waiting.splice(index, 1)
  }

  tick(): void {
    this.pair()
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
    this.pairCasual()
    this.pairRanked()
  }

  private pairCasual(): void {
    for (;;) {
      const casual = this.waiting.filter((entry) => entry.mode === 'casual')
      const first = casual[0]
      const second = casual[1]
      if (first === undefined || second === undefined) return
      this.open(first, second, 'casual')
    }
  }

  private pairRanked(): void {
    for (;;) {
      const candidates = this.waiting.filter((entry) => entry.mode === 'ranked')
      let best: { first: Waiting, second: Waiting, gap: number } | null = null
      for (let left = 0; left < candidates.length; left += 1) {
        for (let right = left + 1; right < candidates.length; right += 1) {
          const first = candidates[left]
          const second = candidates[right]
          if (first === undefined || second === undefined) continue
          const gap = Math.abs(first.mmr - second.mmr)
          if (gap > Math.max(this.window(first), this.window(second))) continue
          if (best === null || gap < best.gap) best = { first, second, gap }
        }
      }
      if (best === null) return
      this.open(best.first, best.second, 'ranked')
    }
  }

  private window(entry: Waiting): number {
    const steps = Math.floor((this.now() - entry.since) / RANKED_WINDOW_STEP_MS)
    return Math.min(RANKED_MAX_WINDOW, RANKED_BASE_WINDOW + steps * RANKED_WINDOW_GROWTH)
  }

  private open(first: Waiting, second: Waiting, mode: MatchMode): void {
    this.leave(first.accountId)
    this.leave(second.accountId)
    const pair: readonly [string, string] = this.coin() ? [first.accountId, second.accountId] : [second.accountId, first.accountId]
    this.rooms.openMatch(pair, () => this.makeSetup(pair), DEFAULT_ROOM_OPTIONS, mode)
  }
}