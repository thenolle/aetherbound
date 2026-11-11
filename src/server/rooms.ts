import type { MatchMode, MatchRecorder } from '../persistence/match-store'
import type { MatchSetup } from '../rules/engine'
import type { PlayerIndex } from '../rules/types'
import { DEFAULT_ROOM_OPTIONS, Room } from './room'
import type { RoomOptions } from './room'

export type SeatBinding = { room: Room, seat: PlayerIndex, accountId: string | null }
export type OpenRoom = Readonly<{ room: Room, tokens: readonly [string, string] }>
export type JoinResult = Readonly<{ seat: PlayerIndex, token: string }>
export type FinishInfo = Readonly<{ matchId: string, accounts: readonly [string | null, string | null], winner: PlayerIndex, inputs: number, mode: MatchMode }>

type NamedRoom = { open: OpenRoom, owners: [string | null, string | null] }
type Assignment = Readonly<{ room: Room, result: JoinResult }>

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function pickSeat(owners: readonly [string | null, string | null], accountId: string): PlayerIndex | null {
  if (owners[0] === accountId) return 0
  if (owners[1] === accountId) return 1
  if (owners[0] === null) return 0
  if (owners[1] === null) return 1
  return null
}

export class RoomRegistry {
  private finishedCount = 0
  private readonly bindings = new Map<string, SeatBinding>()
  private readonly named = new Map<string, NamedRoom>()
  private readonly current = new Map<string, Assignment>()
  private readonly all = new Set<OpenRoom>()
  private readonly recorder: MatchRecorder | null
  private readonly onRankedResult: ((matchId: string, winnerId: string, loserId: string) => void) | null
  private readonly onFinished: ((info: FinishInfo) => void) | null

  constructor(recorder: MatchRecorder | null = null, onRankedResult: ((matchId: string, winnerId: string, loserId: string) => void) | null = null, onFinished: ((info: FinishInfo) => void) | null = null) {
    this.recorder = recorder
    this.onRankedResult = onRankedResult
    this.onFinished = onFinished
  }

  open(setup: MatchSetup, options: RoomOptions = DEFAULT_ROOM_OPTIONS, accounts: readonly [string | null, string | null] = [null, null], mode: MatchMode = 'casual'): OpenRoom {
    const persistence = this.recorder === null ? null : {
      matchId: crypto.randomUUID(),
      recorder: this.recorder,
      accounts,
      mode,
      onFinished: (result: { matchId: string, winner: PlayerIndex, inputs: number }) => this.finish(result, accounts, mode),
    }
    const room = new Room(setup, options, persistence)
    const entry: OpenRoom = { room, tokens: [randomToken(), randomToken()] }
    this.bindings.set(entry.tokens[0], { room, seat: 0, accountId: accounts[0] })
    this.bindings.set(entry.tokens[1], { room, seat: 1, accountId: accounts[1] })
    this.all.add(entry)
    return entry
  }

  openMatch(accounts: readonly [string, string], makeSetup: () => MatchSetup, options: RoomOptions = DEFAULT_ROOM_OPTIONS, mode: MatchMode = 'casual'): void {
    const entry = this.open(makeSetup(), options, accounts, mode)
    for (const seat of [0, 1] as const) this.current.set(accounts[seat], { room: entry.room, result: { seat, token: entry.tokens[seat] } })
  }

  currentFor(accountId: string): JoinResult | null {
    const found = this.current.get(accountId)
    if (found === undefined) return null
    if (found.room.winner !== null) {
      this.current.delete(accountId)
      return null
    }
    return found.result
  }

  lookup(token: string): Readonly<SeatBinding> | null {
    return this.bindings.get(token) ?? null
  }

  joinNamed(name: string, accountId: string, makeSetup: () => MatchSetup, options: RoomOptions = DEFAULT_ROOM_OPTIONS): JoinResult | null {
    let entry = this.named.get(name)
    if (entry === undefined || entry.open.room.winner !== null) {
      if (entry !== undefined) this.release(entry.open)
      entry = { open: this.open(makeSetup(), options), owners: [null, null] }
      this.named.set(name, entry)
    }
    const seat = pickSeat(entry.owners, accountId)
    if (seat === null) return null
    entry.owners[seat] = accountId
    const token = entry.open.tokens[seat]
    const binding = this.bindings.get(token)
    if (binding !== undefined) binding.accountId = accountId
    return { seat, token }
  }

  closeAll(): void {
    for (const entry of [...this.all]) this.release(entry)
    this.named.clear()
    this.current.clear()
  }

  stats(): Readonly<{ rooms: number, live: number, seats: number, finished: number }> {
    let live = 0
    let seats = 0
    for (const entry of this.all) {
      if (entry.room.winner === null) live += 1
      seats += entry.room.connectedSeats
    }
    return { rooms: this.all.size, live, seats, finished: this.finishedCount }
  }

  private release(entry: OpenRoom): void {
    entry.room.dispose()
    this.bindings.delete(entry.tokens[0])
    this.bindings.delete(entry.tokens[1])
    this.all.delete(entry)
    for (const [accountId, assignment] of this.current) {
      if (assignment.room === entry.room) this.current.delete(accountId)
    }
  }

  private rate(matchId: string, accounts: readonly [string | null, string | null], winner: PlayerIndex): void {
    const winnerId = accounts[winner]
    const loserId = accounts[winner === 0 ? 1 : 0]
    if (winnerId !== null && loserId !== null && this.onRankedResult !== null) this.onRankedResult(matchId, winnerId, loserId)
  }

  private finish(result: { matchId: string, winner: PlayerIndex, inputs: number }, accounts: readonly [string | null, string | null], mode: MatchMode): void {
    this.finishedCount += 1
    if (mode === 'ranked') try { this.rate(result.matchId, accounts, result.winner) } catch (error) { console.error('rating failed', error) }
    this.onFinished?.({ matchId: result.matchId, accounts, winner: result.winner, inputs: result.inputs, mode })
  }
}