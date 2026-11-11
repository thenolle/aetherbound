import type { CardRegistry } from './cards'
import { GAME_LIMITS } from './lexicon'
import type { FactionId } from './lexicon'

export type DeckIssueCode = 'wrong_size' | 'unknown_card' | 'too_many_copies' | 'wrong_faction'

export type DeckIssue = Readonly<{ code: DeckIssueCode, cardId?: string }>

export function validateDeck(deck: readonly string[], heroFaction: FactionId, registry: CardRegistry): readonly DeckIssue[] {
  const issues: DeckIssue[] = []
  if (deck.length !== GAME_LIMITS.deckSize) issues.push({ code: 'wrong_size' })
  const counts = new Map<string, number>()
  for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1)
  for (const [id, count] of counts) {
    const card = registry.get(id)
    if (card === undefined) {
      issues.push({ code: 'unknown_card', cardId: id })
      continue
    }
    const limit = card.unique ? GAME_LIMITS.maxUniqueCopies : GAME_LIMITS.maxCopies
    if (count > limit) issues.push({ code: 'too_many_copies', cardId: id })
    if (card.faction !== 'neutral' && card.faction !== heroFaction) issues.push({ code: 'wrong_faction', cardId: id })
  }
  return issues
}