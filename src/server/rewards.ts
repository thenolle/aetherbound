import type { RewardRules } from '../content/economy'
import type { EconomyStore } from '../persistence/economy-store'
import type { FinishInfo } from './rooms'

export function makeRewardHook(economy: EconomyStore, rules: RewardRules, now: () => number): (info: FinishInfo) => void {
  return (info) => {
    const [first, second] = info.accounts
    if (first === null || second === null || info.inputs < rules.minInputs) return
    const day = new Date(now()).toISOString().slice(0, 10)
    economy.grantMatchReward(first, info.matchId, second, day, rules)
    economy.grantMatchReward(second, info.matchId, first, day, rules)
  }
}