import type { Id } from '../shared/ids'
import { other } from './engine'
import type { GameEvent, PlayerIndex, PlayerState } from './types'
import type { MatchState } from './types'

export type OwnView = Omit<PlayerState, 'deck'> & { deckCount: number }

export type OpponentView = Omit<PlayerState, 'deck' | 'hand'> & { deckCount: number, handCount: number }

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
  | Exclude<GameEvent, { type: 'card_drawn' }>
  | { type: 'card_drawn', player: PlayerIndex, cardId: Id<'card'> | null }

export function projectState(state: MatchState, viewer: PlayerIndex): MatchView {
  const { deck: ownDeck, ...own } = state.players[viewer]
  const { deck: foeDeck, hand: foeHand, ...foe } = state.players[other(viewer)]
  return structuredClone({
    rulesVersion: state.rulesVersion,
    turn: state.turn,
    active: state.active,
    winner: state.winner,
    viewer,
    self: { ...own, deckCount: ownDeck.length },
    opponent: { ...foe, deckCount: foeDeck.length, handCount: foeHand.length }
  })
}

export function projectEvent(event: GameEvent, viewer: PlayerIndex): ViewEvent {
  if (event.type === 'card_drawn' && event.player !== viewer) return { ...event, cardId: null }
  return event
}