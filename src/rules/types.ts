import type { Effect } from '../shared/effects'
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
  frozen?: boolean
  blight?: number
  grows?: Readonly<{ attack: number, health: number }>
  keywords: KeywordId[]
  onDeath: Effect[]
}

export type Weapon = {
  cardId: Id<'card'>
  attack: number
  durability: number
}

export type Holding = {
  uid: number
  cardId: Id<'card'>
  charges: number
  used: boolean
}

export type Snare = {
  uid: number
  cardId: Id<'card'>
}

export type Oath = {
  uid: number
  cardId: Id<'card'>
  progress: number
  goal: number
}

export type HeroAbility = {
  cost: number
  effects: Effect[]
}

export type PlayerState = {
  heroId: Id<'hero'>
  heroHealth: number
  heroMaxHealth: number
  aetherMax: number
  aether: number
  tariff: number
  fatigue: number
  fallen: number
  weapon: Weapon | null
  holdings: Holding[]
  snares: Snare[]
  oaths: Oath[]
  heroAttacked: boolean
  ability: HeroAbility
  abilityUsed: boolean
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
  | { type: 'play', handIndex: number, position: number, targetUid?: number }
  | { type: 'cast', handIndex: number, targetUid?: number }
  | { type: 'equip', handIndex: number }
  | { type: 'place', handIndex: number }
  | { type: 'activate', holdingUid: number, targetUid?: number }
  | { type: 'attack', attackerUid: number, target: AttackTarget }
  | { type: 'hero_attack', target: AttackTarget }
  | { type: 'hero_ability', targetUid?: number }
  | { type: 'end_turn' }
  | { type: 'surrender' }
  | { type: 'set', handIndex: number }
  | { type: 'swear', handIndex: number }

export type GameEvent =
  | { type: 'turn_started', player: PlayerIndex, turn: number, aether: number }
  | { type: 'turn_timed_out', player: PlayerIndex }
  | { type: 'card_drawn', player: PlayerIndex, cardId: Id<'card'> }
  | { type: 'card_burned', player: PlayerIndex, cardId: Id<'card'> }
  | { type: 'fatigue', player: PlayerIndex, damage: number }
  | { type: 'minion_played', player: PlayerIndex, uid: number, cardId: Id<'card'>, position: number }
  | { type: 'writ_cast', player: PlayerIndex, cardId: Id<'card'> }
  | { type: 'iron_equipped', player: PlayerIndex, cardId: Id<'card'>, attack: number, durability: number }
  | { type: 'iron_broken', player: PlayerIndex }
  | { type: 'holding_placed', player: PlayerIndex, uid: number, cardId: Id<'card'>, charges: number }
  | { type: 'holding_activated', player: PlayerIndex, uid: number }
  | { type: 'holding_destroyed', player: PlayerIndex, uid: number }
  | { type: 'ability_used', player: PlayerIndex }
  | { type: 'attacked', player: PlayerIndex, attackerUid: number, target: AttackTarget }
  | { type: 'hero_attacked', player: PlayerIndex, target: AttackTarget }
  | { type: 'damaged', player: PlayerIndex, uid: number | null, amount: number }
  | { type: 'healed', player: PlayerIndex, uid: number | null, amount: number }
  | { type: 'taxed', player: PlayerIndex, amount: number }
  | { type: 'minion_died', player: PlayerIndex, uid: number }
  | { type: 'surrendered', player: PlayerIndex }
  | { type: 'game_over', winner: PlayerIndex }
  | { type: 'snare_set', player: PlayerIndex, uid: number, cardId: Id<'card'> }
  | { type: 'snare_sprung', player: PlayerIndex, uid: number, cardId: Id<'card'> }
  | { type: 'oath_sworn', player: PlayerIndex, uid: number, cardId: Id<'card'>, goal: number }
  | { type: 'oath_progress', player: PlayerIndex, uid: number, progress: number }
  | { type: 'oath_fulfilled', player: PlayerIndex, uid: number }
  | { type: 'frozen', player: PlayerIndex, uid: number }
  | { type: 'minion_summoned', player: PlayerIndex, uid: number, cardId: Id<'card'> }
  | { type: 'blighted', player: PlayerIndex, uid: number, stacks: number }
  | { type: 'grew', player: PlayerIndex, uid: number, attack: number, health: number }
  | { type: 'surged', player: PlayerIndex, amount: number }