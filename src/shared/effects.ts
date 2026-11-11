import type { Id } from './ids'

export type EffectTarget = 'enemy-hero' | 'own-hero' | 'chosen-enemy-minion' | 'all-enemy-minions' | 'all-own-minions'

export type Effect =
  | Readonly<{ kind: 'damage' | 'heal', amount: number, target: EffectTarget }>
  | Readonly<{ kind: 'freeze', target: EffectTarget }>
  | Readonly<{ kind: 'blight', amount: number, target: EffectTarget }>
  | Readonly<{ kind: 'summon' | 'raise', cardId: Id<'card'>, attack: number, health: number, count: number }>
  | Readonly<{ kind: 'drain', amount: number }>
  | Readonly<{ kind: 'surge', amount: number }>
  | Readonly<{ kind: 'rupture', count: number }>
  | Readonly<{ kind: 'forge', attack: number, durability: number }>
  | Readonly<{ kind: 'buff', attack: number, health: number }>
  | Readonly<{ kind: 'steal', count: number, take: boolean }>
  | Readonly<{ kind: 'counterfeit' }>
  | Readonly<{ kind: 'draw', count: number }>
  | Readonly<{ kind: 'tariff', amount: number }>

export type TokenEffect = Extract<Effect, { kind: 'summon' | 'raise' }>

export const MAX_EFFECTS_PER_CARD = 8

export const SNARE_TRIGGERS = ['enemy-play', 'enemy-cast', 'enemy-attack'] as const

export type SnareTrigger = typeof SNARE_TRIGGERS[number]

export function effectTarget(effect: Effect): EffectTarget | null {
  if (effect.kind === 'counterfeit') return 'chosen-enemy-minion'
  return effect.kind === 'damage' || effect.kind === 'heal' || effect.kind === 'freeze' || effect.kind === 'blight' ? effect.target : null
}

export function needsChosenTarget(effects: readonly Effect[]): boolean {
  return effects.some((effect) => effectTarget(effect) === 'chosen-enemy-minion')
}