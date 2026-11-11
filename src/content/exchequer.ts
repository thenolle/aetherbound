import type { CardDefinition, HeroDefinition } from '../shared/cards'
import { parseId } from '../shared/ids'

export const EXCHEQUER_HERO: HeroDefinition = {
  id: parseId('hero', 'auditor-maren-voss'),
  name: { en: 'Maren Voss', fr: 'Maren Voss' },
  title: { en: 'Debt-Auditor', fr: 'Auditrice des Dettes' },
  faction: 'exchequer',
  health: 30,
  ability: { name: { en: 'Stamp Tariff', fr: 'Apposer le Tarif' }, cost: 2 }
}

export const EXCHEQUER_CARDS: readonly CardDefinition[] = [
  {
    id: parseId('card', 'tally-clerk'),
    name: { en: 'Tally-Clerk', fr: 'Pointeur de Comptes' },
    faction: 'exchequer',
    family: 'bound',
    rarity: 'common',
    cost: 1,
    unique: false,
    attack: 1,
    health: 2,
    flavor: { en: 'Every debt has a column. Every column has a clerk.', fr: 'Chaque dette a sa colonne. Chaque colonne a son commis.' }
  },
  {
    id: parseId('card', 'iron-clad-levy'),
    name: { en: 'Iron-Clad Levy', fr: 'Levée Cuirassée' },
    faction: 'exchequer',
    family: 'bound',
    rarity: 'common',
    cost: 2,
    unique: false,
    attack: 1,
    health: 4,
    flavor: { en: 'Sworn levies do not retreat. They are not paid to.', fr: 'Les levées jurées ne reculent pas. On ne les paie pas pour ça.' }
  },
  {
    id: parseId('card', 'toll-warden'),
    name: { en: 'Toll-Warden', fr: 'Gardien de Péage' },
    faction: 'exchequer',
    family: 'bound',
    rarity: 'common',
    cost: 2,
    unique: false,
    attack: 2,
    health: 3,
    flavor: { en: 'The bridge is free. Crossing it is not.', fr: 'Le pont est gratuit. Le traverser, non.' }
  },
  {
    id: parseId('card', 'bailiff-vane'),
    name: { en: 'Bailiff Vane', fr: 'Huissier Vane' },
    faction: 'exchequer',
    family: 'bound',
    rarity: 'rare',
    cost: 3,
    unique: false,
    attack: 3,
    health: 3,
    flavor: { en: 'Paid in full, or paid in kind.', fr: 'Payé en totalité, ou payé en nature.' }
  },
  {
    id: parseId('card', 'seal-bearer'),
    name: { en: 'Seal-Bearer', fr: 'Porte-Sceau' },
    faction: 'exchequer',
    family: 'bound',
    rarity: 'rare',
    cost: 4,
    unique: false,
    attack: 4,
    health: 4,
    flavor: { en: 'The wax is still warm. So is the warrant.', fr: 'La cire est encore tiède. Le mandat aussi.' }
  },
  {
    id: parseId('card', 'warden-mireille'),
    name: { en: 'Warden Mireille', fr: 'Gardienne Mireille' },
    faction: 'exchequer',
    family: 'bound',
    rarity: 'legendary',
    cost: 5,
    unique: true,
    attack: 5,
    health: 6,
    flavor: { en: 'Clause nine: no exceptions for the dead.', fr: 'Clause neuf : aucune exception pour les morts.' }
  }
]