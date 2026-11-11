import { MAX_EFFECTS_PER_CARD } from './effects'
import type { Effect } from './effects'
import { DomainError } from './errors'
import type { Id } from './ids'
import { GAME_LIMITS } from './lexicon'
import type { CardFamilyId, FactionId, KeywordId, LocalizedName, RarityId } from './lexicon'

export type CardFaction = FactionId | 'neutral'

export type CardDefinition = Readonly<{
  id: Id<'card'>
  name: LocalizedName
  faction: CardFaction
  family: CardFamilyId
  rarity: RarityId
  cost: number
  unique: boolean
  attack?: number
  health?: number
  keywords?: readonly KeywordId[]
  effects?: readonly Effect[]
  flavor: LocalizedName
}>

export type HeroDefinition = Readonly<{
  id: Id<'hero'>
  name: LocalizedName
  title: LocalizedName
  faction: FactionId
  health: number
  ability: Readonly<{ name: LocalizedName, cost: number }>
}>

export type CardRegistry = ReadonlyMap<string, CardDefinition>

function assertCardDefinition(card: CardDefinition): void {
  const fail = (reason: string): never => { throw new DomainError('invalid_content', `card ${card.id}: ${reason}`) }
  if (!Number.isInteger(card.cost) || card.cost < 0 || card.cost > GAME_LIMITS.aetherPressureMax) fail(`cost must be an integer between 0 and ${GAME_LIMITS.aetherPressureMax}`)
  if (card.keywords !== undefined && card.family !== 'bound') fail('only bound cards carry keywords')
  if (card.family === 'bound') {
    if (card.attack === undefined || !Number.isInteger(card.attack) || card.attack < 0) fail('bound cards need an integer attack >= 0')
    if (card.health === undefined || !Number.isInteger(card.health) || card.health < 1) fail('bound cards need an integer health >= 1')
  }
  if (card.family === 'writ') {
    const effects = card.effects ?? []
    if (effects.length === 0 || effects.length > MAX_EFFECTS_PER_CARD) fail(`writs need 1 to ${MAX_EFFECTS_PER_CARD} effects`)
    for (const effect of effects) {
      if (effect.kind === 'draw') {
        if (!Number.isInteger(effect.count) || effect.count < 1 || effect.count > 10) fail('draw count must be 1 to 10')
      } else if (!Number.isInteger(effect.amount) || effect.amount < 1 || effect.amount > 99) {
        fail('effect amount must be 1 to 99')
      }
    }
  }
}

export function createRegistry(cards: readonly CardDefinition[]): CardRegistry {
  const registry = new Map<string, CardDefinition>()
  for (const card of cards) {
    assertCardDefinition(card)
    if (registry.has(card.id)) throw new DomainError('invalid_content', `duplicate card id ${card.id}`)
    registry.set(card.id, card)
  }
  return registry
}