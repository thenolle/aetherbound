import type { MatchSetup } from '../rules/engine'
import type { PlayerIndex } from '../rules/types'
import { DEFAULT_ROOM_OPTIONS, Room } from './room'
import type { RoomOptions } from './room'

export type SeatBinding = Readonly<{ room: Room, seat: PlayerIndex }>

export type OpenRoom = Readonly<{ room: Room, tokens: readonly [string, string] }>

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export class RoomRegistry {
  private readonly bindings = new Map<string, SeatBinding>()
  private readonly named = new Map<string, OpenRoom>()
  private readonly open_ = new Set<OpenRoom>()

  open(setup: MatchSetup, options: RoomOptions = DEFAULT_ROOM_OPTIONS): OpenRoom {
    const room = new Room(setup, options)
    const entry: OpenRoom = { room, tokens: [randomToken(), randomToken()] }
    this.bindings.set(entry.tokens[0], { room, seat: 0 })
    this.bindings.set(entry.tokens[1], { room, seat: 1 })
    this.open_.add(entry)
    return entry
  }

  lookup(token: string): SeatBinding | null {
    return this.bindings.get(token) ?? null
  }

  joinNamed(name: string, seat: PlayerIndex, makeSetup: () => MatchSetup, options: RoomOptions = DEFAULT_ROOM_OPTIONS): string {
    let entry = this.named.get(name)
    if (entry === undefined || entry.room.winner !== null) {
      if (entry !== undefined) this.release(entry)
      entry = this.open(makeSetup(), options)
      this.named.set(name, entry)
    }
    return entry.tokens[seat]
  }

  closeAll(): void {
    for (const entry of [...this.open_]) this.release(entry)
    this.named.clear()
  }

  private release(entry: OpenRoom): void {
    entry.room.dispose()
    this.bindings.delete(entry.tokens[0])
    this.bindings.delete(entry.tokens[1])
    this.open_.delete(entry)
  }
}