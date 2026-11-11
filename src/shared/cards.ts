import { DomainError } from './errors'
import type { Id } from './ids'
import { GAME_LIMITS } from './lexicon'
import type { CardFamilyId, FactionId, LocalizedName, RarityId } from './lexicon'

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
  if (card.family === 'bound') {
    if (card.attack === undefined || !Number.isInteger(card.attack) || card.attack < 0) fail('bound cards need an integer attack >= 0')
    if (card.health === undefined || !Number.isInteger(card.health) || card.health < 1) fail('bound cards need an integer health >= 1')
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