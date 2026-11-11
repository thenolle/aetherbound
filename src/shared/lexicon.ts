export const LOCALES = ['en', 'fr'] as const
export type Locale = typeof LOCALES[number]
export type LocalizedName = Readonly<Record<Locale, string>>

export const GAME_LIMITS = {
  boardSlots: 7,
  deckSize: 30,
  maxCopies: 2,
  maxUniqueCopies: 1,
  aetherPressureMax: 10
} as const

export const TITLE: LocalizedName = {
  en: 'Aetherbound: Shattered Concord',
  fr: 'Aetherbound : La Concorde Brisee'
}

export const FACTION_IDS = [
  'exchequer',
  'brine-lock',
  'brasswright',
  'briarthorn',
  'choir',
  'cinder-vane',
  'glass-eye',
  'lantern-bearers'
] as const

export type FactionId = typeof FACTION_IDS[number]

export type FactionDefinition = Readonly<{
  id: FactionId
  name: LocalizedName
  archetype: string
}>

export const FACTIONS: Readonly<Record<FactionId, FactionDefinition>> = {
  exchequer: {
    id: 'exchequer',
    name: { en: 'The Concord Exchequer', fr: "L'Echiquier de la Concorde" },
    archetype: 'order, taxation, attrition'
  },
  'brine-lock': {
    id: 'brine-lock',
    name: { en: 'The Brine-Lock Cartel', fr: 'Le Cartel des Ecluses Salines' },
    archetype: 'control, frost, displacement'
  },
  brasswright: {
    id: 'brasswright',
    name: { en: 'The Brasswright Guild', fr: 'La Guilde des Cuivriers' },
    archetype: 'industry, relics, constructs'
  },
  briarthorn: {
    id: 'briarthorn',
    name: { en: 'The Briarthorn Parish', fr: 'La Paroisse des Ronciers' },
    archetype: 'nature, mutation, swarm'
  },
  choir: {
    id: 'choir',
    name: { en: 'The Choir of the Bell', fr: 'Le Choeur de la Cloche' },
    archetype: 'death, echoes, graveyard'
  },
  'cinder-vane': {
    id: 'cinder-vane',
    name: { en: 'The Cinder-Vane Legion', fr: 'La Legion Cendre-Vane' },
    archetype: 'aggression, venting, rush'
  },
  'glass-eye': {
    id: 'glass-eye',
    name: { en: 'The Glass-Eye Syndicate', fr: "Le Syndicat de l'Oeil-de-Verre" },
    archetype: 'espionage, snares, theft'
  },
  'lantern-bearers': {
    id: 'lantern-bearers',
    name: { en: 'The Lantern-Bearers of Sol', fr: 'Les Porte-Lanternes de Sol' },
    archetype: 'zeal, healing, miracles'
  }
}

export const CARD_FAMILY_IDS = ['bound', 'writ', 'iron', 'holding', 'snare', 'oath'] as const
export type CardFamilyId = typeof CARD_FAMILY_IDS[number]

export const CARD_FAMILIES: Readonly<Record<CardFamilyId, LocalizedName>> = {
  bound: { en: 'Bound', fr: 'Lies' },
  writ: { en: 'Writs', fr: 'Mandats' },
  iron: { en: 'Irons', fr: 'Fers' },
  holding: { en: 'Holdings', fr: 'Domaines' },
  snare: { en: 'Snares', fr: 'Pieges' },
  oath: { en: 'Oaths', fr: 'Serments' }
}

export const RARITY_IDS = ['common', 'rare', 'epic', 'legendary'] as const
export type RarityId = typeof RARITY_IDS[number]

export const RARITIES: Readonly<Record<RarityId, LocalizedName>> = {
  common: { en: 'Common', fr: 'Commune' },
  rare: { en: 'Rare', fr: 'Rare' },
  epic: { en: 'Epic', fr: 'Epique' },
  legendary: { en: 'Legendary', fr: 'Legendaire' }
}

export const KEYWORD_IDS = ['shield-wall', 'haste'] as const
export type KeywordId = typeof KEYWORD_IDS[number]

export const KEYWORDS: Readonly<Record<KeywordId, LocalizedName>> = {
  'shield-wall': { en: 'Shield-Wall', fr: 'Mur de Boucliers' },
  haste: { en: 'Haste', fr: 'Hate' }
}

export const BOARD_IDS = [
  'high-manifold',
  'low-tide-drydock',
  'valve-foundry',
  'saint-sorrows-ossuary',
  'sunken-cistern',
  'ruptured-trench'
] as const

export type BoardId = typeof BOARD_IDS[number]

export const BOARDS: Readonly<Record<BoardId, LocalizedName>> = {
  'high-manifold': { en: 'The High Manifold', fr: 'Le Haut Collecteur' },
  'low-tide-drydock': { en: 'Low-Tide Drydock', fr: 'Cale Seche de Maree Basse' },
  'valve-foundry': { en: 'The Valve-Foundry', fr: 'La Fonderie des Vannes' },
  'saint-sorrows-ossuary': { en: "Saint-Sorrow's Ossuary", fr: 'Ossuaire de Saint-Chagrin' },
  'sunken-cistern': { en: 'The Sunken Cistern', fr: 'La Citerne Engloutie' },
  'ruptured-trench': { en: 'The Ruptured Trench', fr: 'La Tranchee Rompue' }
}

export function localize(name: LocalizedName, locale: Locale): string {
  return name[locale]
}

export function allLexiconNames(): readonly LocalizedName[] {
  return [
    TITLE,
    ...Object.values(FACTIONS).map((faction) => faction.name),
    ...Object.values(CARD_FAMILIES),
    ...Object.values(RARITIES),
    ...Object.values(KEYWORDS),
    ...Object.values(BOARDS)
  ]
}