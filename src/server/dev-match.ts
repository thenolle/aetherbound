import { EXCHEQUER_CARDS, EXCHEQUER_DECK, EXCHEQUER_HERO } from '../content/exchequer'
import type { ContentLookup } from '../persistence/restore'
import type { MatchSetup } from '../rules/engine'
import { createRegistry } from '../shared/cards'

const registry = createRegistry(EXCHEQUER_CARDS)

export const devContent: ContentLookup = {
  registry,
  heroes: new Map([[EXCHEQUER_HERO.id, EXCHEQUER_HERO]])
}

export function devMatchSetup(): MatchSetup {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1
  const side = { hero: EXCHEQUER_HERO, deck: EXCHEQUER_DECK }
  return { seed, registry, players: [side, side] }
}