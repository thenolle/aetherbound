import { assertHeroDefinition } from '../shared/cards'
import type { CardRegistry, HeroDefinition } from '../shared/cards'
import { validateDeck } from '../shared/deck'
import { needsChosenTarget } from '../shared/effects'
import type { Effect, SnareTrigger, TokenEffect } from '../shared/effects'
import { DomainError } from '../shared/errors'
import type { Id } from '../shared/ids'
import { GAME_LIMITS } from '../shared/lexicon'
import { Rng } from '../shared/rng'
import { VERSIONS } from '../shared/versions'
import { RULES } from './constants'
import type { AttackTarget, Command, GameEvent, Holding, MatchState, Minion, PlayerIndex, PlayerState } from './types'

export type MatchSetup = Readonly<{
  seed: number
  players: readonly [PlayerSetup, PlayerSetup]
  registry: CardRegistry
}>

export type PlayerSetup = Readonly<{ hero: HeroDefinition, deck: readonly Id<'card'>[] }>
export type StepResult = Readonly<{ state: MatchState, events: readonly GameEvent[] }>

const PLAYERS = [0, 1] as const

export const other = (player: PlayerIndex): PlayerIndex => (player === 0 ? 1 : 0)
const invalid = (message: string): DomainError => new DomainError('invalid_command', message)

function resolveGameOver(state: MatchState, events: GameEvent[]): void {
  if (state.winner !== null) return
  const loser = PLAYERS.find((player) => state.players[player].heroHealth <= 0)
  if (loser === undefined) return
  state.winner = other(loser)
  events.push({ type: 'game_over', winner: state.winner })
}

function damageHero(state: MatchState, player: PlayerIndex, amount: number, events: GameEvent[]): void {
  state.players[player].heroHealth -= amount
  events.push({ type: 'damaged', player, uid: null, amount })
  resolveGameOver(state, events)
}

function healHero(state: MatchState, player: PlayerIndex, amount: number, events: GameEvent[]): void {
  const side = state.players[player]
  const gained = Math.min(amount, side.heroMaxHealth - side.heroHealth)
  if (gained <= 0) return
  side.heroHealth += gained
  events.push({ type: 'healed', player, uid: null, amount: gained })
}

function drawCard(state: MatchState, player: PlayerIndex, events: GameEvent[]): void {
  const side = state.players[player]
  const cardId = side.deck.shift()
  if (cardId === undefined) {
    side.fatigue += 1
    events.push({ type: 'fatigue', player, damage: side.fatigue })
    damageHero(state, player, side.fatigue, events)
    return
  }
  if (side.hand.length >= RULES.handLimit) {
    events.push({ type: 'card_burned', player, cardId })
    return
  }
  side.hand.push(cardId)
  events.push({ type: 'card_drawn', player, cardId })
}

function startTurn(state: MatchState, events: GameEvent[]): void {
  state.turn += 1
  const side = state.players[state.active]
  side.aetherMax = Math.min(GAME_LIMITS.aetherPressureMax, side.aetherMax + 1)
  side.aether = Math.max(0, side.aetherMax - side.tariff)
  side.tariff = 0
  side.heroAttacked = false
  side.abilityUsed = false
  for (const holding of side.holdings) holding.used = false
  events.push({ type: 'turn_started', player: state.active, turn: state.turn, aether: side.aether })
  drawCard(state, state.active, events)
  if (state.winner === null) {
    for (const minion of side.board) {
      const frozen = minion.frozen === true
      minion.exhausted = frozen
      if (frozen) delete minion.frozen
    }
  }
  for (const minion of side.board) {
    const stacks = minion.blight ?? 0
    if (stacks <= 0) continue
    minion.health -= stacks
    events.push({ type: 'damaged', player: state.active, uid: minion.uid, amount: stacks })
    if (stacks > 1) minion.blight = stacks - 1
    else delete minion.blight
  }
  settleBoards(state, events)
}

function passTurn(state: MatchState, events: GameEvent[]): void {
  state.active = other(state.active)
  startTurn(state, events)
}

function placeToken(state: MatchState, caster: PlayerIndex, token: TokenEffect, events: GameEvent[]): boolean {
  const side = state.players[caster]
  if (side.board.length >= GAME_LIMITS.boardSlots) return false
  const minion: Minion = {
    uid: state.nextUid,
    cardId: token.cardId,
    attack: token.attack,
    health: token.health,
    maxHealth: token.health,
    exhausted: true,
    keywords: [],
    onDeath: []
  }
  state.nextUid += 1
  side.board.push(minion)
  events.push({ type: 'minion_summoned', player: caster, uid: minion.uid, cardId: token.cardId })
  return true
}

function applyEffect(state: MatchState, caster: PlayerIndex, effect: Effect, chosen: Minion | undefined, events: GameEvent[]): void {
  const foe = other(caster)
  if (effect.kind === 'draw') {
    for (let count = 0; count < effect.count && state.winner === null; count += 1) drawCard(state, caster, events)
    return
  }
  if (effect.kind === 'tariff') {
    state.players[foe].tariff += effect.amount
    events.push({ type: 'taxed', player: foe, amount: effect.amount })
    return
  }
  if (effect.kind === 'freeze') {
    const chill = (minion: Minion): void => {
      minion.frozen = true
      events.push({ type: 'frozen', player: foe, uid: minion.uid })
    }
    if (effect.target === 'chosen-enemy-minion') {
      if (chosen !== undefined) chill(chosen)
    } else if (effect.target === 'all-enemy-minions') {
      for (const minion of state.players[foe].board) chill(minion)
    }
    return
  }
  if (effect.kind === 'blight') {
    const amount = effect.amount
    const infect = (minion: Minion): void => {
      minion.blight = Math.min(RULES.maxBlight, (minion.blight ?? 0) + amount)
      events.push({ type: 'blighted', player: foe, uid: minion.uid, stacks: minion.blight })
    }
    if (effect.target === 'chosen-enemy-minion') {
      if (chosen !== undefined) infect(chosen)
    } else if (effect.target === 'all-enemy-minions') {
      for (const minion of state.players[foe].board) infect(minion)
    }
    return
  }
  if (effect.kind === 'summon') {
    for (let count = 0; count < effect.count; count += 1) {
      if (!placeToken(state, caster, effect, events)) break
    }
    return
  }
  if (effect.kind === 'raise') {
    const side = state.players[caster]
    for (let count = 0; count < effect.count && side.fallen > 0; count += 1) {
      if (!placeToken(state, caster, effect, events)) break
      side.fallen -= 1
    }
    return
  }
  if (effect.kind === 'drain') {
    damageHero(state, foe, effect.amount, events)
    if (state.winner === null) healHero(state, caster, effect.amount, events)
    return
  }
  if (effect.kind !== 'damage' && effect.kind !== 'heal') return
  const amount = effect.amount
  const harmful = effect.kind === 'damage'
  const affectHero = (player: PlayerIndex): void => {
    if (harmful) damageHero(state, player, amount, events)
    else healHero(state, player, amount, events)
  }
  const affectMinion = (player: PlayerIndex, minion: Minion): void => {
    if (harmful) {
      minion.health -= amount
      events.push({ type: 'damaged', player, uid: minion.uid, amount })
      return
    }
    const gained = Math.min(amount, minion.maxHealth - minion.health)
    if (gained <= 0) return
    minion.health += gained
    events.push({ type: 'healed', player, uid: minion.uid, amount: gained })
  }
  switch (effect.target) {
    case 'enemy-hero':
      affectHero(foe)
      break
    case 'own-hero':
      affectHero(caster)
      break
    case 'chosen-enemy-minion':
      if (chosen !== undefined) affectMinion(foe, chosen)
      break
    case 'all-enemy-minions':
      for (const minion of state.players[foe].board) affectMinion(foe, minion)
      break
  }
}

function runEffects(state: MatchState, caster: PlayerIndex, effects: readonly Effect[], chosen: Minion | undefined, events: GameEvent[]): void {
  for (const effect of effects) {
    if (state.winner !== null) break
    applyEffect(state, caster, effect, chosen, events)
  }
}

function settleBoards(state: MatchState, events: GameEvent[]): void {
  for (let round = 0; round < RULES.settleRounds; round += 1) {
    const dead: { owner: PlayerIndex, minion: Minion }[] = []
    for (const owner of [state.active, other(state.active)]) {
      const side = state.players[owner]
      const survivors: Minion[] = []
      for (const minion of side.board) {
        if (minion.health > 0) {
          survivors.push(minion)
        } else {
          dead.push({ owner, minion })
          events.push({ type: 'minion_died', player: owner, uid: minion.uid })
        }
      }
      side.board = survivors
    }
    if (dead.length === 0) return
    for (const { owner } of dead) state.players[owner].fallen += 1
    for (const owner of PLAYERS) {
      for (const minion of state.players[owner].board) {
        const grows = minion.grows
        if (grows === undefined) continue
        minion.attack += grows.attack * dead.length
        minion.health += grows.health * dead.length
        minion.maxHealth += grows.health * dead.length
        events.push({ type: 'grew', player: owner, uid: minion.uid, attack: minion.attack, health: minion.health })
      }
    }
    for (const { owner, minion } of dead) {
      const times = minion.keywords.includes('echo') ? 2 : 1
      for (let pass = 0; pass < times; pass += 1) runEffects(state, owner, minion.onDeath, undefined, events)
    }
  }
  throw new DomainError('internal', 'board did not settle')
}

function takeHandCard(state: MatchState, handIndex: number, registry: CardRegistry) {
  const side = state.players[state.active]
  if (!Number.isInteger(handIndex) || handIndex < 0 || handIndex >= side.hand.length) throw invalid('hand index out of range')
  const cardId = side.hand[handIndex]
  const card = cardId === undefined ? undefined : registry.get(cardId)
  if (cardId === undefined || card === undefined) throw new DomainError('internal', 'card missing from registry')
  return { cardId, card }
}

function pickTarget(state: MatchState, effects: readonly Effect[], targetUid: number | undefined): Minion | undefined {
  if (!needsChosenTarget(effects)) {
    if (targetUid !== undefined) throw invalid('this effect takes no target')
    return undefined
  }
  if (targetUid === undefined) throw new DomainError('illegal_target', 'this effect needs a target')
  const found = state.players[other(state.active)].board.find((minion) => minion.uid === targetUid)
  if (found === undefined) throw new DomainError('illegal_target', 'target minion not found')
  return found
}

function checkAttackTarget(defenderSide: PlayerState, target: AttackTarget): Minion | null {
  const walls = defenderSide.board.filter((minion) => minion.keywords.includes('shield-wall'))
  if (target.kind === 'hero') {
    if (walls.length > 0) throw new DomainError('illegal_target', 'a shield-wall blocks the hero')
    return null
  }
  if (target.kind === 'minion') {
    const defender = defenderSide.board.find((minion) => minion.uid === target.uid)
    if (defender === undefined) throw new DomainError('illegal_target', 'target minion not found')
    if (walls.length > 0 && !defender.keywords.includes('shield-wall')) throw new DomainError('illegal_target', 'a shield-wall must be attacked first')
    return defender
  }
  throw invalid('unknown target kind')
}

function playCard(state: MatchState, command: Extract<Command, { type: 'play' }>, registry: CardRegistry, events: GameEvent[]): void {
  const caster = state.active
  const side = state.players[caster]
  const { cardId, card } = takeHandCard(state, command.handIndex, registry)
  if (!Number.isInteger(command.position) || command.position < 0 || command.position > side.board.length) throw invalid('board position out of range')
  if (card.family !== 'bound') throw invalid('only bound cards can be played onto a ward')
  if (card.cost > side.aether) throw new DomainError('insufficient_aether', 'not enough Aether Pressure')
  if (side.board.length >= GAME_LIMITS.boardSlots) throw new DomainError('board_full', 'all seven wards are occupied')
  if (card.attack === undefined || card.health === undefined) throw new DomainError('internal', 'bound card without stats')
  const trigger = card.onPlay ?? []
  const chosen = pickTarget(state, trigger, command.targetUid)
  const keywords = [...(card.keywords ?? [])]
  side.aether -= card.cost
  side.hand.splice(command.handIndex, 1)
  const minion: Minion = {
    uid: state.nextUid,
    cardId,
    attack: card.attack,
    health: card.health,
    maxHealth: card.health,
    exhausted: !keywords.includes('haste'),
    keywords,
    onDeath: [...(card.onDeath ?? [])],
    ...(card.grows === undefined ? {} : { grows: card.grows }),
  }
  state.nextUid += 1
  side.board.splice(command.position, 0, minion)
  events.push({ type: 'minion_played', player: caster, uid: minion.uid, cardId, position: command.position })
  runEffects(state, caster, trigger, chosen, events)
  advanceOaths(state, caster, registry, events)
  settleBoards(state, events)
}

function castWrit(state: MatchState, command: Extract<Command, { type: 'cast' }>, registry: CardRegistry, events: GameEvent[]): void {
  const caster = state.active
  const side = state.players[caster]
  const { cardId, card } = takeHandCard(state, command.handIndex, registry)
  if (card.family !== 'writ') throw invalid('only writs can be cast')
  const effects = card.effects ?? []
  if (effects.length === 0) throw new DomainError('internal', 'writ without effects')
  if (card.cost > side.aether) throw new DomainError('insufficient_aether', 'not enough Aether Pressure')
  const chosen = pickTarget(state, effects, command.targetUid)
  side.aether -= card.cost
  side.hand.splice(command.handIndex, 1)
  events.push({ type: 'writ_cast', player: caster, cardId })
  runEffects(state, caster, effects, chosen, events)
  settleBoards(state, events)
}

function equipIron(state: MatchState, command: Extract<Command, { type: 'equip' }>, registry: CardRegistry, events: GameEvent[]): void {
  const side = state.players[state.active]
  const { cardId, card } = takeHandCard(state, command.handIndex, registry)
  if (card.family !== 'iron') throw invalid('only irons can be equipped')
  if (card.attack === undefined || card.durability === undefined) throw new DomainError('internal', 'iron without stats')
  if (card.cost > side.aether) throw new DomainError('insufficient_aether', 'not enough Aether Pressure')
  side.aether -= card.cost
  side.hand.splice(command.handIndex, 1)
  side.weapon = { cardId, attack: card.attack, durability: card.durability }
  events.push({ type: 'iron_equipped', player: state.active, cardId, attack: card.attack, durability: card.durability })
}

function useHeroAbility(state: MatchState, command: Extract<Command, { type: 'hero_ability' }>, events: GameEvent[]): void {
  const caster = state.active
  const side = state.players[caster]
  if (side.abilityUsed) throw invalid('the hero ability was already used this turn')
  if (side.ability.cost > side.aether) throw new DomainError('insufficient_aether', 'not enough Aether Pressure')
  const chosen = pickTarget(state, side.ability.effects, command.targetUid)
  side.aether -= side.ability.cost
  side.abilityUsed = true
  events.push({ type: 'ability_used', player: caster })
  runEffects(state, caster, side.ability.effects, chosen, events)
  settleBoards(state, events)
}

function placeHolding(state: MatchState, command: Extract<Command, { type: 'place' }>, registry: CardRegistry, events: GameEvent[]): void {
  const side = state.players[state.active]
  const { cardId, card } = takeHandCard(state, command.handIndex, registry)
  if (card.family !== 'holding') throw invalid('only holdings can be placed')
  if (card.durability === undefined) throw new DomainError('internal', 'holding without charges')
  if (card.cost > side.aether) throw new DomainError('insufficient_aether', 'not enough Aether Pressure')
  if (side.holdings.length >= RULES.holdingSlots) throw new DomainError('board_full', 'all holding slots are occupied')
  side.aether -= card.cost
  side.hand.splice(command.handIndex, 1)
  const holding: Holding = { uid: state.nextUid, cardId, charges: card.durability, used: false }
  state.nextUid += 1
  side.holdings.push(holding)
  events.push({ type: 'holding_placed', player: state.active, uid: holding.uid, cardId, charges: holding.charges })
}

function activateHolding(state: MatchState, command: Extract<Command, { type: 'activate' }>, registry: CardRegistry, events: GameEvent[]): void {
  const caster = state.active
  const side = state.players[caster]
  const holding = side.holdings.find((entry) => entry.uid === command.holdingUid)
  if (holding === undefined) throw invalid('unknown holding')
  if (holding.used) throw invalid('this holding was already used this turn')
  const effects = registry.get(holding.cardId)?.effects ?? []
  if (effects.length === 0) throw new DomainError('internal', 'holding without effects')
  const chosen = pickTarget(state, effects, command.targetUid)
  holding.used = true
  holding.charges -= 1
  events.push({ type: 'holding_activated', player: caster, uid: holding.uid })
  runEffects(state, caster, effects, chosen, events)
  if (holding.charges <= 0) {
    side.holdings = side.holdings.filter((entry) => entry !== holding)
    events.push({ type: 'holding_destroyed', player: caster, uid: holding.uid })
  }
  settleBoards(state, events)
}

const SNARE_TRIGGER_BY_COMMAND: Partial<Record<Command['type'], SnareTrigger>> = {
  play: 'enemy-play',
  cast: 'enemy-cast',
  attack: 'enemy-attack',
  hero_attack: 'enemy-attack'
}

function setSnare(state: MatchState, command: Extract<Command, { type: 'set' }>, registry: CardRegistry, events: GameEvent[]): void {
  const side = state.players[state.active]
  const { cardId, card } = takeHandCard(state, command.handIndex, registry)
  if (card.family !== 'snare') throw invalid('only snares can be set')
  if (card.cost > side.aether) throw new DomainError('insufficient_aether', 'not enough Aether Pressure')
  if (side.snares.length >= RULES.snareSlots) throw new DomainError('board_full', 'all snare slots are occupied')
  side.aether -= card.cost
  side.hand.splice(command.handIndex, 1)
  const snare = { uid: state.nextUid, cardId }
  state.nextUid += 1
  side.snares.push(snare)
  events.push({ type: 'snare_set', player: state.active, uid: snare.uid, cardId })
}

function fireSnare(state: MatchState, trigger: SnareTrigger, registry: CardRegistry, events: GameEvent[]): void {
  if (state.winner !== null) return
  const owner = other(state.active)
  const side = state.players[owner]
  const index = side.snares.findIndex((snare) => registry.get(snare.cardId)?.trigger === trigger)
  if (index < 0) return
  const [snare] = side.snares.splice(index, 1)
  if (snare === undefined) return
  events.push({ type: 'snare_sprung', player: owner, uid: snare.uid, cardId: snare.cardId })
  runEffects(state, owner, registry.get(snare.cardId)?.effects ?? [], undefined, events)
}

function swearOath(state: MatchState, command: Extract<Command, { type: 'swear' }>, registry: CardRegistry, events: GameEvent[]): void {
  const side = state.players[state.active]
  const { cardId, card } = takeHandCard(state, command.handIndex, registry)
  if (card.family !== 'oath') throw invalid('only oaths can be sworn')
  if (card.goal === undefined) throw new DomainError('internal', 'oath without a goal')
  if (card.cost > side.aether) throw new DomainError('insufficient_aether', 'not enough Aether Pressure')
  if (side.oaths.length >= RULES.oathSlots) throw new DomainError('board_full', 'an oath is already sworn')
  side.aether -= card.cost
  side.hand.splice(command.handIndex, 1)
  const oath = { uid: state.nextUid, cardId, progress: 0, goal: card.goal }
  state.nextUid += 1
  side.oaths.push(oath)
  events.push({ type: 'oath_sworn', player: state.active, uid: oath.uid, cardId, goal: oath.goal })
}

function advanceOaths(state: MatchState, player: PlayerIndex, registry: CardRegistry, events: GameEvent[]): void {
  const side = state.players[player]
  for (const oath of [...side.oaths]) {
    if (state.winner !== null) return
    oath.progress += 1
    events.push({ type: 'oath_progress', player, uid: oath.uid, progress: oath.progress })
    if (oath.progress < oath.goal) continue
    side.oaths = side.oaths.filter((entry) => entry !== oath)
    events.push({ type: 'oath_fulfilled', player, uid: oath.uid })
    runEffects(state, player, registry.get(oath.cardId)?.effects ?? [], undefined, events)
  }
}

function resolveAttack(state: MatchState, command: Extract<Command, { type: 'attack' }>, events: GameEvent[]): void {
  const attackerIndex = state.active
  const defenderIndex = other(attackerIndex)
  const attacker = state.players[attackerIndex].board.find((minion) => minion.uid === command.attackerUid)
  if (attacker === undefined) throw invalid('unknown attacker')
  if (attacker.exhausted) throw invalid('this minion cannot attack yet')
  if (attacker.attack <= 0) throw invalid('this minion has no attack')
  const defender = checkAttackTarget(state.players[defenderIndex], command.target)
  events.push({ type: 'attacked', player: attackerIndex, attackerUid: attacker.uid, target: command.target })
  attacker.exhausted = true
  if (defender === null) {
    damageHero(state, defenderIndex, attacker.attack, events)
    return
  }
  const dealt = attacker.attack
  const received = defender.attack
  defender.health -= dealt
  events.push({ type: 'damaged', player: defenderIndex, uid: defender.uid, amount: dealt })
  if (received > 0) {
    attacker.health -= received
    events.push({ type: 'damaged', player: attackerIndex, uid: attacker.uid, amount: received })
  }
  settleBoards(state, events)
}

function resolveHeroAttack(state: MatchState, command: Extract<Command, { type: 'hero_attack' }>, events: GameEvent[]): void {
  const attackerIndex = state.active
  const defenderIndex = other(attackerIndex)
  const side = state.players[attackerIndex]
  const weapon = side.weapon
  if (weapon === null) throw invalid('no iron is equipped')
  if (side.heroAttacked) throw invalid('the hero already attacked this turn')
  const defender = checkAttackTarget(state.players[defenderIndex], command.target)
  events.push({ type: 'hero_attacked', player: attackerIndex, target: command.target })
  side.heroAttacked = true
  if (defender === null) {
    damageHero(state, defenderIndex, weapon.attack, events)
  } else {
    defender.health -= weapon.attack
    events.push({ type: 'damaged', player: defenderIndex, uid: defender.uid, amount: weapon.attack })
    if (defender.attack > 0) damageHero(state, attackerIndex, defender.attack, events)
  }
  weapon.durability -= 1
  if (weapon.durability <= 0) {
    side.weapon = null
    events.push({ type: 'iron_broken', player: attackerIndex })
  }
  settleBoards(state, events)
}

export function createMatch(setup: MatchSetup): StepResult {
  const rng = new Rng(setup.seed)
  const build = (entry: PlayerSetup): PlayerState => {
    assertHeroDefinition(entry.hero)
    const issues = validateDeck(entry.deck, entry.hero.faction, setup.registry)
    if (issues.length > 0) throw new DomainError('deck_invalid', `deck rejected: ${issues.map((issue) => issue.code).join(', ')}`)
    return {
      heroId: entry.hero.id,
      heroHealth: entry.hero.health,
      heroMaxHealth: entry.hero.health,
      aetherMax: 0,
      aether: 0,
      tariff: 0,
      fatigue: 0,
      weapon: null,
      holdings: [],
      snares: [],
      oaths: [],
      heroAttacked: false,
      ability: { cost: entry.hero.ability.cost, effects: [...entry.hero.ability.effects] },
      abilityUsed: false,
      fallen: 0,
      deck: rng.shuffle(entry.deck),
      hand: [],
      board: []
    }
  }
  const state: MatchState = {
    rulesVersion: VERSIONS.rules,
    turn: 0,
    active: 0,
    players: [build(setup.players[0]), build(setup.players[1])],
    nextUid: 1,
    rngState: rng.getState(),
    winner: null
  }
  const events: GameEvent[] = []
  for (const player of PLAYERS) {
    for (let count = 0; count < RULES.openingHand[player]; count += 1) drawCard(state, player, events)
  }
  startTurn(state, events)
  return { state, events }
}

export function applyCommand(state: MatchState, actor: PlayerIndex, command: Command, registry: CardRegistry): StepResult {
  if (state.winner !== null) throw invalid('the match is over')
  const next = structuredClone(state)
  const events: GameEvent[] = []
  if (command.type === 'surrender') {
    events.push({ type: 'surrendered', player: actor })
    next.winner = other(actor)
    events.push({ type: 'game_over', winner: next.winner })
    return { state: next, events }
  }
  if (actor !== next.active) throw new DomainError('not_your_turn', 'it is not your turn')
  switch (command.type) {
    case 'play':
      playCard(next, command, registry, events)
      break
    case 'cast':
      castWrit(next, command, registry, events)
      break
    case 'equip':
      equipIron(next, command, registry, events)
      break
    case 'place':
      placeHolding(next, command, registry, events)
      break
    case 'activate':
      activateHolding(next, command, registry, events)
      break
    case 'attack':
      resolveAttack(next, command, events)
      break
    case 'set':
      setSnare(next, command, registry, events)
      break
    case 'swear':
      swearOath(next, command, registry, events)
      break
    case 'hero_attack':
      resolveHeroAttack(next, command, events)
      break
    case 'hero_ability':
      useHeroAbility(next, command, events)
      break
    case 'end_turn':
      passTurn(next, events)
      break
    default:
      throw invalid('unknown command')
  }
  const trigger = SNARE_TRIGGER_BY_COMMAND[command.type]
  if (trigger !== undefined && next.winner === null) {
    fireSnare(next, trigger, registry, events)
    settleBoards(next, events)
  }
  return { state: next, events }
}

export function timeoutTurn(state: MatchState): StepResult {
  if (state.winner !== null) throw invalid('the match is over')
  const next = structuredClone(state)
  const events: GameEvent[] = [{ type: 'turn_timed_out', player: next.active }]
  passTurn(next, events)
  return { state: next, events }
}