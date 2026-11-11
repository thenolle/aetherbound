import type { Id } from '../shared/ids'
import { other } from './engine'
import type { GameEvent, MatchState, PlayerIndex, PlayerState } from './types'

export type OwnView = Omit<PlayerState, 'deck'> & { deckCount: number }

export type OpponentView = Omit<PlayerState, 'deck' | 'hand' | 'snares'> & {
  deckCount: number
  handCount: number
  snareCount: number
}

export type MatchView = {
  rulesVersion: number
  turn: number
  active: PlayerIndex
  winner: PlayerIndex | null
  viewer: PlayerIndex
  self: OwnView
  opponent: OpponentView
}

export type ViewEvent =
  | Exclude<GameEvent, { type: 'card_drawn' } | { type: 'snare_set' } | { type: 'card_stolen' }>
  | { type: 'card_drawn', player: PlayerIndex, cardId: Id<'card'> | null }
  | { type: 'snare_set', player: PlayerIndex, uid: number, cardId: Id<'card'> | null }
  | { type: 'card_stolen', player: PlayerIndex, cardId: Id<'card'> | null }

export function projectState(state: MatchState, viewer: PlayerIndex): MatchView {
  const { deck: ownDeck, ...own } = state.players[viewer]
  const { deck: foeDeck, hand: foeHand, snares: foeSnares, ...foe } = state.players[other(viewer)]
  return structuredClone({
    rulesVersion: state.rulesVersion,
    turn: state.turn,
    active: state.active,
    winner: state.winner,
    viewer,
    self: { ...own, deckCount: ownDeck.length },
    opponent: { ...foe, deckCount: foeDeck.length, handCount: foeHand.length, snareCount: foeSnares.length }
  })
}

export function projectEvent(event: GameEvent, viewer: PlayerIndex): ViewEvent {
  if (event.type === 'card_drawn' && event.player !== viewer) return { ...event, cardId: null }
  if (event.type === 'snare_set' && event.player !== viewer) return { ...event, cardId: null }
  if (event.type === 'card_stolen' && event.player !== viewer) return { ...event, cardId: null }
  return event
}