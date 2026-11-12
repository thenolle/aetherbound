import { BRASSWRIGHT_CARDS, BRASSWRIGHT_DECK, BRASSWRIGHT_HERO } from '../content/brasswright'
import { BRIARTHORN_CARDS, BRIARTHORN_DECK, BRIARTHORN_HERO } from '../content/briarthorn'
import { BRINE_LOCK_CARDS, BRINE_LOCK_DECK, BRINE_LOCK_HERO } from '../content/brine-lock'
import { CHOIR_CARDS, CHOIR_DECK, CHOIR_HERO } from '../content/choir'
import { CINDER_VANE_CARDS, CINDER_VANE_DECK, CINDER_VANE_HERO } from '../content/cinder-vane'
import { EXCHEQUER_CARDS, EXCHEQUER_DECK, EXCHEQUER_HERO } from '../content/exchequer'
import { GLASS_EYE_CARDS, GLASS_EYE_DECK, GLASS_EYE_HERO } from '../content/glass-eye'
import { LANTERN_BEARERS_CARDS, LANTERN_BEARERS_DECK, LANTERN_BEARERS_HERO } from '../content/lantern-bearers'
import { createRegistry } from '../shared/cards'
import type { HeroDefinition } from '../shared/cards'
import type { Id } from '../shared/ids'

export type Contender = Readonly<{
  name: string
  hero: HeroDefinition
  deck: readonly Id<'card'>[]
}>

const entry = (hero: HeroDefinition, deck: readonly Id<'card'>[]): Contender => ({ name: hero.faction, hero, deck })

export const CONTENDERS: readonly Contender[] = [
  entry(EXCHEQUER_HERO, EXCHEQUER_DECK),
  entry(BRINE_LOCK_HERO, BRINE_LOCK_DECK),
  entry(BRIARTHORN_HERO, BRIARTHORN_DECK),
  entry(CHOIR_HERO, CHOIR_DECK),
  entry(CINDER_VANE_HERO, CINDER_VANE_DECK),
  entry(BRASSWRIGHT_HERO, BRASSWRIGHT_DECK),
  entry(GLASS_EYE_HERO, GLASS_EYE_DECK),
  entry(LANTERN_BEARERS_HERO, LANTERN_BEARERS_DECK)
]

export const SIM_REGISTRY = createRegistry([
  ...EXCHEQUER_CARDS,
  ...BRINE_LOCK_CARDS,
  ...BRIARTHORN_CARDS,
  ...CHOIR_CARDS,
  ...CINDER_VANE_CARDS,
  ...BRASSWRIGHT_CARDS,
  ...GLASS_EYE_CARDS,
  ...LANTERN_BEARERS_CARDS
])