import type { Id } from '../shared/ids'

export type PlayerIndex = 0 | 1

export type Minion = {
  uid: number
  cardId: Id<'card'>
  attack: number
  health: number
  maxHealth: number
  exhausted: boolean
}

export type PlayerState = {
  heroId: Id<'hero'>
  heroHealth: number
  aetherMax: number
  aether: number
  fatigue: number
  deck: Id<'card'>[]
  hand: Id<'card'>[]
  board: Minion[]
}

export type MatchState = {
  rulesVersion: number
  turn: number
  active: PlayerIndex
  players: [PlayerState, PlayerState]
  nextUid: number
  rngState: number
  winner: PlayerIndex | null
}

export type AttackTarget = { kind: 'hero' } | { kind: 'minion', uid: number }

export type Command =
  | { type: 'play', handIndex: number, position: number }
  | { type: 'attack', attackerUid: number, target: AttackTarget }
  | { type: 'end_turn' }

export type GameEvent =
  | { type: 'turn_started', player: PlayerIndex, turn: number, aether: number }
  | { type: 'card_drawn', player: PlayerIndex, cardId: Id<'card'> }
  | { type: 'card_burned', player: PlayerIndex, cardId: Id<'card'> }
  | { type: 'fatigue', player: PlayerIndex, damage: number }
  | { type: 'minion_played', player: PlayerIndex, uid: number, cardId: Id<'card'>, position: number }
  | { type: 'attacked', player: PlayerIndex, attackerUid: number, target: AttackTarget }
  | { type: 'damaged', player: PlayerIndex, uid: number | null, amount: number }
  | { type: 'minion_died', player: PlayerIndex, uid: number }
  | { type: 'game_over', winner: PlayerIndex }