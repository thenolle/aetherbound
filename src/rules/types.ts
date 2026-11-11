import type { Id } from '../shared/ids'
import type { KeywordId } from '../shared/lexicon'

export type PlayerIndex = 0 | 1

export type Minion = {
  uid: number
  cardId: Id<'card'>
  attack: number
  health: number
  maxHealth: number
  exhausted: boolean
  keywords: KeywordId[]
}

export type PlayerState = {
  heroId: Id<'hero'>
  heroHealth: number
  heroMaxHealth: number
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
  | { type: 'cast', handIndex: number, targetUid?: number }
  | { type: 'attack', attackerUid: number, target: AttackTarget }
  | { type: 'end_turn' }
  | { type: 'surrender' }

export type GameEvent =
  | { type: 'turn_started', player: PlayerIndex, turn: number, aether: number }
  | { type: 'turn_timed_out', player: PlayerIndex }
  | { type: 'card_drawn', player: PlayerIndex, cardId: Id<'card'> }
  | { type: 'card_burned', player: PlayerIndex, cardId: Id<'card'> }
  | { type: 'fatigue', player: PlayerIndex, damage: number }
  | { type: 'minion_played', player: PlayerIndex, uid: number, cardId: Id<'card'>, position: number }
  | { type: 'writ_cast', player: PlayerIndex, cardId: Id<'card'> }
  | { type: 'attacked', player: PlayerIndex, attackerUid: number, target: AttackTarget }
  | { type: 'damaged', player: PlayerIndex, uid: number | null, amount: number }
  | { type: 'healed', player: PlayerIndex, uid: number | null, amount: number }
  | { type: 'minion_died', player: PlayerIndex, uid: number }
  | { type: 'surrendered', player: PlayerIndex }
  | { type: 'game_over', winner: PlayerIndex }