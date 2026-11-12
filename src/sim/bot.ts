import { applyCommand, createMatch, other } from '../rules/engine'
import type { MatchSetup, StepResult } from '../rules/engine'
import type { AttackTarget, Command, GameEvent, MatchState, Minion, PlayerIndex, PlayerState } from '../rules/types'
import type { CardRegistry } from '../shared/cards'
import { needsChosenTarget } from '../shared/effects'
import type { Effect } from '../shared/effects'
import { DomainError } from '../shared/errors'

const MAX_TURNS = 120
const MAX_ACTIONS = 60

const PLAYED = new Set<GameEvent['type']>(['minion_played', 'writ_cast', 'iron_equipped', 'holding_placed', 'snare_set', 'oath_sworn'])

export type MatchOutcome = Readonly<{
  winner: PlayerIndex | null
  turns: number
  played: readonly [ReadonlySet<string>, ReadonlySet<string>]
}>

const strongest = (board: readonly Minion[]): Minion | undefined =>
  [...board].sort((a, b) => b.attack + b.health - (a.attack + a.health) || a.uid - b.uid)[0]

const withTarget = (effects: readonly Effect[], target: Minion | undefined): { targetUid?: number } | null => {
  if (!needsChosenTarget(effects)) return {}
  return target === undefined ? null : { targetUid: target.uid }
}

export function attackTarget(attacker: Minion, foeBoard: readonly Minion[]): AttackTarget | null {
  const walls = foeBoard.filter((minion) => minion.keywords.includes('shield-wall'))
  const pool = walls.length > 0 ? walls : foeBoard
  const safeKill = pool.filter((minion) => minion.warded !== true && attacker.attack >= minion.health && minion.attack < attacker.health).sort((a, b) => b.attack + b.health - (a.attack + a.health) || a.uid - b.uid)[0]
  if (safeKill !== undefined) return { kind: 'minion', uid: safeKill.uid }
  const wall = walls[0]
  if (wall !== undefined) return { kind: 'minion', uid: wall.uid }
  return { kind: 'hero' }
}

function* abilityCommands(me: PlayerState, target: Minion | undefined): Generator<Command> {
  if (me.abilityUsed || me.ability.cost > me.aether) return
  const selfHarm = me.ability.effects.some((effect) => effect.kind === 'damage' && effect.target === 'own-hero')
  if (selfHarm && me.heroHealth <= 8) return
  const extra = withTarget(me.ability.effects, target)
  if (extra !== null) yield { type: 'hero_ability', ...extra }
}

export function* candidates(state: MatchState, seat: PlayerIndex, registry: CardRegistry): Generator<Command> {
  const me = state.players[seat]
  const foe = state.players[other(seat)]
  const target = strongest(foe.board)
  if (me.ability.effects.some((effect) => effect.kind === 'surge')) yield* abilityCommands(me, target)
  const hand = me.hand.flatMap((cardId, handIndex) => {
    const card = registry.get(cardId)
    return card === undefined ? [] : [{ handIndex, card }]
  }).sort((a, b) => b.card.cost - a.card.cost || a.handIndex - b.handIndex)
  for (const { handIndex, card } of hand) {
    if (card.cost > me.aether) continue
    if (card.family === 'bound') {
      const extra = withTarget(card.onPlay ?? [], target)
      if (extra !== null) yield { type: 'play', handIndex, position: me.board.length, ...extra }
    } else if (card.family === 'writ') {
      const extra = withTarget(card.effects ?? [], target)
      if (extra !== null) yield { type: 'cast', handIndex, ...extra }
    } else if (card.family === 'iron') {
      yield { type: 'equip', handIndex }
    } else if (card.family === 'holding') {
      yield { type: 'place', handIndex }
    } else if (card.family === 'snare') {
      yield { type: 'set', handIndex }
    } else if (card.family === 'oath') {
      yield { type: 'swear', handIndex }
    }
  }
  for (const holding of me.holdings) {
    if (holding.used) continue
    const extra = withTarget(registry.get(holding.cardId)?.effects ?? [], target)
    if (extra !== null) yield { type: 'activate', holdingUid: holding.uid, ...extra }
  }
  yield* abilityCommands(me, target)
  for (const minion of me.board) {
    if (minion.exhausted || minion.attack <= 0) continue
    const aim = attackTarget(minion, foe.board)
    if (aim !== null) yield { type: 'attack', attackerUid: minion.uid, target: aim }
  }
  if (me.weapon !== null && !me.heroAttacked) {
    const wall = foe.board.find((minion) => minion.keywords.includes('shield-wall'))
    yield { type: 'hero_attack', target: wall === undefined ? { kind: 'hero' } : { kind: 'minion', uid: wall.uid } }
  }
}

function advance(state: MatchState, seat: PlayerIndex, registry: CardRegistry): StepResult | null {
  for (const command of candidates(state, seat, registry)) {
    try {
      return applyCommand(state, seat, command, registry)
    } catch (error) {
      if (!(error instanceof DomainError)) throw error
    }
  }
  return null
}

function noteCards(events: readonly GameEvent[], played: [Set<string>, Set<string>]): void {
  for (const event of events) {
    if (PLAYED.has(event.type) && 'cardId' in event) played[event.player].add(event.cardId)
  }
}

export function playMatch(setup: MatchSetup): MatchOutcome {
  let state = createMatch(setup).state
  const played: [Set<string>, Set<string>] = [new Set(), new Set()]
  while (state.winner === null && state.turn < MAX_TURNS) {
    const seat = state.active
    for (let actions = 0; actions < MAX_ACTIONS && state.winner === null; actions += 1) {
      const step = advance(state, seat, setup.registry)
      if (step === null) break
      noteCards(step.events, played)
      state = step.state
    }
    if (state.winner === null) state = applyCommand(state, seat, { type: 'end_turn' }, setup.registry).state
  }
  return { winner: state.winner, turns: state.turn, played }
}