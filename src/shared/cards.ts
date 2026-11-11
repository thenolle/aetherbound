import { DomainError } from './errors'
import type { Id } from './ids'
import { GAME_LIMITS } from './lexicon'
import type { CardFamilyId, FactionId, KeywordId, LocalizedName, RarityId } from './lexicon'
import { MAX_EFFECTS_PER_CARD, SNARE_TRIGGERS, needsChosenTarget } from './effects'
import type { Effect, SnareTrigger, TokenEffect } from './effects'

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
  durability?: number
  keywords?: readonly KeywordId[]
  effects?: readonly Effect[]
  onPlay?: readonly Effect[]
  onDeath?: readonly Effect[]
  trigger?: SnareTrigger
  goal?: number
  token?: boolean
  grows?: Readonly<{ attack: number, health: number }>
  flavor: LocalizedName
}>

export type HeroDefinition = Readonly<{
  id: Id<'hero'>
  name: LocalizedName
  title: LocalizedName
  faction: FactionId
  health: number
  ability: Readonly<{ name: LocalizedName, cost: number, effects: readonly Effect[] }>
}>

export type CardRegistry = ReadonlyMap<string, CardDefinition>

type Fail = (reason: string) => never

function checkEffects(effects: readonly Effect[], fail: Fail): void {
  if (effects.length === 0 || effects.length > MAX_EFFECTS_PER_CARD) fail(`effects need 1 to ${MAX_EFFECTS_PER_CARD} entries`)
  for (const effect of effects) {
    if (effect.kind === 'draw') {
      if (!Number.isInteger(effect.count) || effect.count < 1 || effect.count > 10) fail('draw count must be 1 to 10')
    } else if (effect.kind === 'freeze') {
      if (effect.target !== 'chosen-enemy-minion' && effect.target !== 'all-enemy-minions') fail('freeze needs an enemy minion target')
    } else if (effect.kind === 'blight') {
      if (effect.target !== 'chosen-enemy-minion' && effect.target !== 'all-enemy-minions') fail('blight needs an enemy minion target')
      if (!Number.isInteger(effect.amount) || effect.amount < 1 || effect.amount > 5) fail('blight amount must be 1 to 5')
    } else if (effect.kind === 'summon' || effect.kind === 'raise') {
      if (!Number.isInteger(effect.count) || effect.count < 1 || effect.count > GAME_LIMITS.boardSlots) fail('summon count must be 1 to 7')
      if (!Number.isInteger(effect.attack) || effect.attack < 0 || effect.attack > 99) fail('summoned attack must be 0 to 99')
      if (!Number.isInteger(effect.health) || effect.health < 1 || effect.health > 99) fail('summoned health must be 1 to 99')
    } else if ('amount' in effect && (!Number.isInteger(effect.amount) || effect.amount < 1 || effect.amount > 99)) {
      fail('effect amount must be 1 to 99')
    }
  }
}

const validCost = (cost: number): boolean => Number.isInteger(cost) && cost >= 0 && cost <= GAME_LIMITS.aetherPressureMax

function assertCardDefinition(card: CardDefinition): void {
  const fail: Fail = (reason) => { throw new DomainError('invalid_content', `card ${card.id}: ${reason}`) }
  if (!validCost(card.cost)) fail(`cost must be an integer between 0 and ${GAME_LIMITS.aetherPressureMax}`)
  if (card.keywords !== undefined && card.family !== 'bound') fail('only bound cards carry keywords')
  if (card.grows !== undefined) {
    const { attack, health } = card.grows
    const valid = Number.isInteger(attack) && Number.isInteger(health) && attack >= 0 && health >= 0 && attack <= 9 && health <= 9 && attack + health > 0
    if (card.family !== 'bound' || !valid) fail('only bound cards can grow, with integer bonuses from 0 to 9 that are not both zero')
  }
  if (card.token === true && card.family !== 'bound') fail('only bound cards can be tokens')
  if ((card.onPlay !== undefined || card.onDeath !== undefined) && card.family !== 'bound') fail('only bound cards carry triggers')
  if (card.family === 'bound') {
    if (card.attack === undefined || !Number.isInteger(card.attack) || card.attack < 0) fail('bound cards need an integer attack >= 0')
    if (card.health === undefined || !Number.isInteger(card.health) || card.health < 1) fail('bound cards need an integer health >= 1')
  }
  if (card.family === 'iron') {
    if (card.attack === undefined || !Number.isInteger(card.attack) || card.attack < 1) fail('irons need an integer attack >= 1')
    if (card.durability === undefined || !Number.isInteger(card.durability) || card.durability < 1) fail('irons need an integer durability >= 1')
  }
  if (card.family === 'holding') {
    if (card.durability === undefined || !Number.isInteger(card.durability) || card.durability < 1) fail('holdings need an integer durability >= 1')
    checkEffects(card.effects ?? [], fail)
  }
  if (card.family === 'snare') {
    if (card.trigger === undefined || !SNARE_TRIGGERS.includes(card.trigger)) fail('snares need a valid trigger')
    checkEffects(card.effects ?? [], fail)
    if (needsChosenTarget(card.effects ?? [])) fail('snare effects cannot choose a target')
  }
  if (card.family === 'oath') {
    if (card.goal === undefined || !Number.isInteger(card.goal) || card.goal < 1 || card.goal > 20) fail('oaths need an integer goal between 1 and 20')
    checkEffects(card.effects ?? [], fail)
    if (needsChosenTarget(card.effects ?? [])) fail('oath rewards cannot choose a target')
  }
  if (card.family === 'writ') checkEffects(card.effects ?? [], fail)
  if (card.onPlay !== undefined) checkEffects(card.onPlay, fail)
  if (card.onDeath !== undefined) {
    checkEffects(card.onDeath, fail)
    if (needsChosenTarget(card.onDeath)) fail('death effects cannot choose a target')
  }
}

export function assertHeroDefinition(hero: HeroDefinition): void {
  const fail: Fail = (reason) => { throw new DomainError('invalid_content', `hero ${hero.id}: ${reason}`) }
  if (!Number.isInteger(hero.health) || hero.health < 1 || hero.health > 99) fail('health must be an integer between 1 and 99')
  if (!validCost(hero.ability.cost)) fail(`ability cost must be an integer between 0 and ${GAME_LIMITS.aetherPressureMax}`)
  checkEffects(hero.ability.effects, fail)
}

export function summonsOf(card: CardDefinition): TokenEffect[] {
  return [...(card.effects ?? []), ...(card.onPlay ?? []), ...(card.onDeath ?? [])].filter(
    (effect): effect is TokenEffect => effect.kind === 'summon' || effect.kind === 'raise'
  )
}

export function createRegistry(cards: readonly CardDefinition[]): CardRegistry {
  const registry = new Map<string, CardDefinition>()
  for (const card of cards) {
    assertCardDefinition(card)
    if (registry.has(card.id)) throw new DomainError('invalid_content', `duplicate card id ${card.id}`)
    registry.set(card.id, card)
  }
  for (const card of cards) {
    for (const summon of summonsOf(card)) {
      const token = registry.get(summon.cardId)
      if (token === undefined || token.token !== true || token.attack !== summon.attack || token.health !== summon.health) throw new DomainError('invalid_content', `card ${card.id}: summons ${summon.cardId}, which is not a matching token`)
    }
  }
  return registry
}