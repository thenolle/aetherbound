import type { RarityId } from '../shared/lexicon'

export type RewardRules = Readonly<{
  minInputs: number
  packsPerMatch: number
  dailyPackCap: number
  perOpponentPerDay: number
}>

export const REWARD_RULES: RewardRules = {
  minInputs: 8,
  packsPerMatch: 1,
  dailyPackCap: 3,
  perOpponentPerDay: 2
}

export const CRAFT_COST: Readonly<Record<RarityId, number>> = {
  common: 40,
  rare: 100,
  epic: 400,
  legendary: 1600
}