import type { CardRegistry, HeroDefinition } from '../shared/cards'
import { validateDeck } from '../shared/deck'
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

function reapDead(state: MatchState, player: PlayerIndex, events: GameEvent[]): void {
  const side = state.players[player]
  const survivors: Minion[] = []
  for (const minion of side.board) {
    if (minion.health > 0) survivors.push(minion)
    else events.push({ type: 'minion_died', player, uid: minion.uid })
  }
  side.board = survivors
}

function playCard(state: MatchState, command: Extract<Command, { type: 'play' }>, registry: CardRegistry, events: GameEvent[]): void {
  const side = state.players[state.active]
  if (!Number.isInteger(command.handIndex) || command.handIndex < 0 || command.handIndex >= side.hand.length) throw invalid('hand index out of range')
  if (!Number.isInteger(command.position) || command.position < 0 || command.position > side.board.length) throw invalid('board position out of range')
  const cardId = side.hand[command.handIndex]
  const card = cardId === undefined ? undefined : registry.get(cardId)
  if (cardId === undefined || card === undefined) throw new DomainError('internal', 'card missing from registry')
  if (card.family !== 'bound') throw invalid('this card family is not playable yet')
  if (card.cost > side.aether) throw new DomainError('insufficient_aether', 'not enough Aether Pressure')
  if (side.board.length >= GAME_LIMITS.boardSlots) throw new DomainError('board_full', 'all seven wards are occupied')
  if (card.attack === undefined || card.health === undefined) throw new DomainError('internal', 'bound card without stats')
  side.aether -= card.cost
  side.hand.splice(command.handIndex, 1)
  const minion: Minion = { uid: state.nextUid, cardId, attack: card.attack, health: card.health, maxHealth: card.health, exhausted: true }
  state.nextUid += 1
  side.board.splice(command.position, 0, minion)
  events.push({ type: 'minion_played', player: state.active, uid: minion.uid, cardId, position: command.position })
}

function resolveAttack(state: MatchState, command: Extract<Command, { type: 'attack' }>, events: GameEvent[]): void {
  const attackerIndex = state.active
  const defenderIndex = other(attackerIndex)
  const attackerSide = state.players[attackerIndex]
  const defenderSide: PlayerState = state.players[defenderIndex]
  const attacker = attackerSide.board.find((minion) => minion.uid === command.attackerUid)
  if (attacker === undefined) throw invalid('unknown attacker')
  if (attacker.exhausted) throw invalid('this minion cannot attack yet')
  if (attacker.attack <= 0) throw invalid('this minion has no attack')
  const target = command.target
  switch (target.kind) {
    case 'hero':
      events.push({ type: 'attacked', player: attackerIndex, attackerUid: attacker.uid, target })
      attacker.exhausted = true
      damageHero(state, defenderIndex, attacker.attack, events)
      return
    case 'minion': {
      const defender = defenderSide.board.find((minion) => minion.uid === target.uid)
      if (defender === undefined) throw new DomainError('illegal_target', 'target minion not found')
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
    return { heroId: entry.hero.id, heroHealth: entry.hero.health, aetherMax: 0, aether: 0, fatigue: 0, deck: rng.shuffle(entry.deck), hand: [], board: [] }
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
  if (actor !== state.active) throw new DomainError('not_your_turn', 'it is not your turn')
  const next = structuredClone(state)
  const events: GameEvent[] = []
  switch (command.type) {
    case 'play':
      playCard(next, command, registry, events)
      break
    case 'attack':
      resolveAttack(next, command, events)
      break
    case 'end_turn':
      next.active = other(next.active)
      startTurn(next, events)
      break
    default:
      throw invalid('unknown command')
  }
  return { state: next, events }
}