export type EffectTarget = 'enemy-hero' | 'own-hero' | 'chosen-enemy-minion' | 'all-enemy-minions'

export type Effect =
  | Readonly<{ kind: 'damage' | 'heal', amount: number, target: EffectTarget }>
  | Readonly<{ kind: 'draw', count: number }>
  | Readonly<{ kind: 'tariff', amount: number }>

export const MAX_EFFECTS_PER_CARD = 8

export function effectTarget(effect: Effect): EffectTarget | null {
  return effect.kind === 'damage' || effect.kind === 'heal' ? effect.target : null
}

export function needsChosenTarget(effects: readonly Effect[]): boolean {
  return effects.some((effect) => effectTarget(effect) === 'chosen-enemy-minion')
}

export const SNARE_TRIGGERS = ['enemy-play', 'enemy-cast', 'enemy-attack'] as const

export type SnareTrigger = typeof SNARE_TRIGGERS[number]