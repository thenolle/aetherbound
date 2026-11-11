import { BRINE_LOCK_CARDS, BRINE_LOCK_HERO } from '../content/brine-lock'
import { EXCHEQUER_CARDS, EXCHEQUER_DECK, EXCHEQUER_HERO } from '../content/exchequer'
import type { ContentLookup } from '../persistence/restore'
import type { MatchSetup } from '../rules/engine'
import { createRegistry } from '../shared/cards'
import { BRIARTHORN_CARDS, BRIARTHORN_HERO } from '../content/briarthorn'
import { CHOIR_CARDS, CHOIR_HERO } from '../content/choir'
import { CINDER_VANE_CARDS, CINDER_VANE_HERO } from '../content/cinder-vane'
import { BRASSWRIGHT_CARDS, BRASSWRIGHT_HERO } from '../content/brasswright'

const registry = createRegistry([...EXCHEQUER_CARDS, ...BRINE_LOCK_CARDS, ...BRIARTHORN_CARDS, ...CHOIR_CARDS, ...CINDER_VANE_CARDS, ...BRASSWRIGHT_CARDS])

export const devContent: ContentLookup = {
  registry,
  heroes: new Map([
    [EXCHEQUER_HERO.id, EXCHEQUER_HERO],
    [BRINE_LOCK_HERO.id, BRINE_LOCK_HERO],
    [BRIARTHORN_HERO.id, BRIARTHORN_HERO],
    [CHOIR_HERO.id, CHOIR_HERO],
    [CINDER_VANE_HERO.id, CINDER_VANE_HERO],
    [BRASSWRIGHT_HERO.id, BRASSWRIGHT_HERO]
  ])
}

export function devMatchSetup(): MatchSetup {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1
  const side = { hero: EXCHEQUER_HERO, deck: EXCHEQUER_DECK }
  return { seed, registry, players: [side, side] }
}