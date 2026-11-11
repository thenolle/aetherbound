import type { CardDefinition } from '../shared/cards'
import { DomainError } from '../shared/errors'
import { RARITY_IDS } from '../shared/lexicon'
import type { RarityId } from '../shared/lexicon'
import type { Rng } from '../shared/rng'

export type PackTable = Readonly<{
  version: number
  size: number
  weights: Readonly<Record<RarityId, number>>
  guaranteedSlot: number
  guaranteedMinimum: RarityId
  dust: Readonly<Record<RarityId, number>>
}>

export const PACK_TABLE: PackTable = {
  version: 1,
  size: 5,
  weights: { common: 70, rare: 22, epic: 6, legendary: 2 },
  guaranteedSlot: 4,
  guaranteedMinimum: 'rare',
  dust: { common: 5, rare: 20, epic: 100, legendary: 400 }
}

export function rollPack(rng: Rng, pool: readonly CardDefinition[], table: PackTable = PACK_TABLE): string[] {
  const picks: string[] = []
  for (let slot = 0; slot < table.size; slot += 1) {
    const floor = slot === table.guaranteedSlot ? RARITY_IDS.indexOf(table.guaranteedMinimum) : 0
    const options = RARITY_IDS.filter((rarity, rank) => rank >= floor && pool.some((card) => card.rarity === rarity))
    if (options.length === 0) throw new DomainError('internal', 'the card pool cannot fill a pack slot')

    let roll = rng.nextInt(options.reduce((sum, rarity) => sum + table.weights[rarity], 0))
    let chosen = options[0] ?? 'common'
    for (const rarity of options) {
      if (roll < table.weights[rarity]) {
        chosen = rarity
        break
      }
      roll -= table.weights[rarity]
    }

    const candidates = pool.filter((card) => card.rarity === chosen)
    const card = candidates[rng.nextInt(candidates.length)]
    if (card === undefined) throw new DomainError('internal', 'no card for the chosen rarity')
    picks.push(card.id)
  }
  return picks
}