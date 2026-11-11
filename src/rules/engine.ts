import type { CardRegistry, HeroDefinition } from '../shared/cards'
import { validateDeck } from '../shared/deck'
import { needsChosenTarget } from '../shared/effects'
import type { Effect } from '../shared/effects'
import { DomainError } from '../shared/errors'
import type { Id } from '../shared/ids'
import { GAME_LIMITS } from '../shared/lexicon'
import { Rng } from '../shared/rng'
import { VERSIONS } from '../shared/versions'
import { RULES } from './constants'
import type { Command, GameEvent, MatchState, Minion, PlayerIndex, PlayerState } from './types'

export type PlayerSetup = Readonly<{ hero: HeroDefinition, deck: readonly Id<'card'>[] }>

export type MatchSetup = Readonly<{
  seed: number
  players: readonly [PlayerSetup, PlayerSetup]
  registry: CardRegistry
}>

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
  side.aether = side.aetherMax
  events.push({ type: 'turn_started', player: state.active, turn: state.turn, aether: side.aether })
  drawCard(state, state.active, events)
  if (state.winner === null) {
    for (const minion of side.board) minion.exhausted = false
  }
}

function passTurn(state: MatchState, events: GameEvent[]): void {
  state.active = other(state.active)
  startTurn(state, events)
}

function reapDead(state: MatchState, player: PlayerIndex, events: GameEvent[]): void {
  const side = state.players[player]
  const survivors: Minion[] = []
  for (const minion of side.board) {
    if (minion.health > 0) survivors.push(minion)
    else events.push({ type: 'minion_died', player, uid: minion.uid })
  }
  side.board = survivors
}

function takeHandCard(state: MatchState, handIndex: number, registry: CardRegistry) {
  const side = state.players[state.active]
  if (!Number.isInteger(handIndex) || handIndex < 0 || handIndex >= side.hand.length) throw invalid('hand index out of range')
  const cardId = side.hand[handIndex]
  const card = cardId === undefined ? undefined : registry.get(cardId)
  if (cardId === undefined || card === undefined) throw new DomainError('internal', 'card missing from registry')
  return { cardId, card }
}

function playCard(state: MatchState, command: Extract<Command, { type: 'play' }>, registry: CardRegistry, events: GameEvent[]): void {
  const side = state.players[state.active]
  const { cardId, card } = takeHandCard(state, command.handIndex, registry)
  if (!Number.isInteger(command.position) || command.position < 0 || command.position > side.board.length) throw invalid('board position out of range')
  if (card.family !== 'bound') throw invalid('only bound cards can be played onto a ward')
  if (card.cost > side.aether) throw new DomainError('insufficient_aether', 'not enough Aether Pressure')
  if (side.board.length >= GAME_LIMITS.boardSlots) throw new DomainError('board_full', 'all seven wards are occupied')
  if (card.attack === undefined || card.health === undefined) throw new DomainError('internal', 'bound card without stats')
  const keywords = [...(card.keywords ?? [])]
  side.aether -= card.cost
  side.hand.splice(command.handIndex, 1)
  const minion: Minion = { uid: state.nextUid, cardId, attack: card.attack, health: card.health, maxHealth: card.health, exhausted: !keywords.includes('haste'), keywords }
  state.nextUid += 1
  side.board.splice(command.position, 0, minion)
  events.push({ type: 'minion_played', player: state.active, uid: minion.uid, cardId, position: command.position })
}

function applyEffect(state: MatchState, effect: Effect, chosen: Minion | undefined, events: GameEvent[]): void {
  const caster = state.active
  const foe = other(caster)
  if (effect.kind === 'draw') {
    for (let count = 0; count < effect.count && state.winner === null; count += 1) drawCard(state, caster, events)
    return
  }
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

function castWrit(state: MatchState, command: Extract<Command, { type: 'cast' }>, registry: CardRegistry, events: GameEvent[]): void {
  const side = state.players[state.active]
  const foeIndex = other(state.active)
  const { cardId, card } = takeHandCard(state, command.handIndex, registry)
  if (card.family !== 'writ') throw invalid('only writs can be cast')
  const effects = card.effects ?? []
  if (effects.length === 0) throw new DomainError('internal', 'writ without effects')
  if (card.cost > side.aether) throw new DomainError('insufficient_aether', 'not enough Aether Pressure')
  let chosen: Minion | undefined
  if (needsChosenTarget(effects)) {
    if (command.targetUid === undefined) throw new DomainError('illegal_target', 'this writ needs a target')
    chosen = state.players[foeIndex].board.find((minion) => minion.uid === command.targetUid)
    if (chosen === undefined) throw new DomainError('illegal_target', 'target minion not found')
  } else if (command.targetUid !== undefined) {
    throw invalid('this writ takes no target')
  }
  side.aether -= card.cost
  side.hand.splice(command.handIndex, 1)
  events.push({ type: 'writ_cast', player: state.active, cardId })
  for (const effect of effects) {
    if (state.winner !== null) break
    applyEffect(state, effect, chosen, events)
  }
  reapDead(state, state.active, events)
  reapDead(state, foeIndex, events)
}

function resolveAttack(state: MatchState, command: Extract<Command, { type: 'attack' }>, events: GameEvent[]): void {
  const attackerIndex = state.active
  const defenderIndex = other(attackerIndex)
  const attackerSide = state.players[attackerIndex]
  const defenderSide = state.players[defenderIndex]
  const attacker = attackerSide.board.find((minion) => minion.uid === command.attackerUid)
  if (attacker === undefined) throw invalid('unknown attacker')
  if (attacker.exhausted) throw invalid('this minion cannot attack yet')
  if (attacker.attack <= 0) throw invalid('this minion has no attack')
  const walls = defenderSide.board.filter((minion) => minion.keywords.includes('shield-wall'))
  const target = command.target
  switch (target.kind) {
    case 'hero':
      if (walls.length > 0) throw new DomainError('illegal_target', 'a shield-wall blocks the hero')
      events.push({ type: 'attacked', player: attackerIndex, attackerUid: attacker.uid, target })
      attacker.exhausted = true
      damageHero(state, defenderIndex, attacker.attack, events)
      return
    case 'minion': {
      const defender = defenderSide.board.find((minion) => minion.uid === target.uid)
      if (defender === undefined) throw new DomainError('illegal_target', 'target minion not found')
      if (walls.length > 0 && !defender.keywords.includes('shield-wall')) throw new DomainError('illegal_target', 'a shield-wall must be attacked first')
      events.push({ type: 'attacked', player: attackerIndex, attackerUid: attacker.uid, target })
      attacker.exhausted = true
      const dealt = attacker.attack
      const received = defender.attack
      defender.health -= dealt
      events.push({ type: 'damaged', player: defenderIndex, uid: defender.uid, amount: dealt })
      if (received > 0) {
        attacker.health -= received
        events.push({ type: 'damaged', player: attackerIndex, uid: attacker.uid, amount: received })
      }
      reapDead(state, attackerIndex, events)
      reapDead(state, defenderIndex, events)
      return
    }
    default:
      throw invalid('unknown target kind')
  }
}

export function createMatch(setup: MatchSetup): StepResult {
  const rng = new Rng(setup.seed)
  const build = (entry: PlayerSetup): PlayerState => {
    const issues = validateDeck(entry.deck, entry.hero.faction, setup.registry)
    if (issues.length > 0) throw new DomainError('deck_invalid', `deck rejected: ${issues.map((issue) => issue.code).join(', ')}`)
    return { heroId: entry.hero.id, heroHealth: entry.hero.health, heroMaxHealth: entry.hero.health, aetherMax: 0, aether: 0, fatigue: 0, deck: rng.shuffle(entry.deck), hand: [], board: [] }
  }
  const state: MatchState = { rulesVersion: VERSIONS.rules, turn: 0, active: 0, players: [build(setup.players[0]), build(setup.players[1])], nextUid: 1, rngState: rng.getState(), winner: null }
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
    case 'attack':
      resolveAttack(next, command, events)
      break
    case 'end_turn':
      passTurn(next, events)
      break
    default:
      throw invalid('unknown command')
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