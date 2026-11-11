import type { CardDefinition } from '../shared/cards'
import { parseId } from '../shared/ids'
import type { CardFamilyId, FactionId, RarityId } from '../shared/lexicon'

export type CardExtra = Partial<
  Pick<CardDefinition, 'keywords' | 'effects' | 'onPlay' | 'onDeath' | 'trigger' | 'durability' | 'unique' | 'goal' | 'token' | 'grows'>
>

export type CardStats = Readonly<{ attack?: number, health?: number }>

export function defineCard(faction: FactionId, id: string, family: CardFamilyId, rarity: RarityId, cost: number, names: readonly [string, string], flavor: readonly [string, string], stats: CardStats, extra: CardExtra = {}): CardDefinition {
  return { id: parseId('card', id), name: { en: names[0], fr: names[1] }, faction, family, rarity, cost, unique: false, ...stats, ...extra, flavor: { en: flavor[0], fr: flavor[1] } }
}