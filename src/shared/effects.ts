export type EffectTarget = 'enemy-hero' | 'own-hero' | 'chosen-enemy-minion' | 'all-enemy-minions'

export type Effect =
  | Readonly<{ kind: 'damage' | 'heal', amount: number, target: EffectTarget }>
  | Readonly<{ kind: 'draw', count: number }>

export const MAX_EFFECTS_PER_CARD = 8

export function needsChosenTarget(effects: readonly Effect[]): boolean {
  return effects.some((effect) => effect.kind !== 'draw' && effect.target === 'chosen-enemy-minion')
}