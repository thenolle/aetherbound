import type { CardDefinition, HeroDefinition } from '../shared/cards'
import { parseId } from '../shared/ids'
import type { Id } from '../shared/ids'

export const EXCHEQUER_HERO: HeroDefinition = {
  id: parseId('hero', 'auditor-maren-voss'),
  name: { en: 'Maren Voss', fr: 'Maren Voss' },
  title: { en: 'Debt-Auditor', fr: 'Auditrice des Dettes' },
  faction: 'exchequer',
  health: 30,
  ability: {
    name: { en: 'Stamp Tariff', fr: 'Apposer le Tarif' },
    cost: 2,
    effects: [{ kind: 'tariff', amount: 1 }]
  }
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
    id: parseId('card', 'debt-runner'),
    name: { en: 'Debt-Runner', fr: 'Coursier des Dettes' },
    faction: 'exchequer',
    family: 'bound',
    rarity: 'common',
    cost: 1,
    unique: false,
    attack: 2,
    health: 1,
    flavor: { en: 'Fast on the stairs, slow on the interest.', fr: "Rapide dans l'escalier, lent sur l'interet." }
  },
  {
    id: parseId('card', 'iron-clad-levy'),
    name: { en: 'Iron-Clad Levy', fr: 'Levee Cuirassee' },
    faction: 'exchequer',
    family: 'bound',
    rarity: 'common',
    cost: 2,
    unique: false,
    attack: 1,
    health: 4,
    keywords: ['shield-wall'],
    flavor: { en: 'Sworn levies do not retreat. They are not paid to.', fr: 'Les levees jurees ne reculent pas. On ne les paie pas pour ca.' }
  },
  {
    id: parseId('card', 'toll-warden'),
    name: { en: 'Toll-Warden', fr: 'Gardien de Peage' },
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
    id: parseId('card', 'tithe-hound'),
    name: { en: 'Tithe-Hound', fr: 'Limier de la Dime' },
    faction: 'exchequer',
    family: 'bound',
    rarity: 'common',
    cost: 2,
    unique: false,
    attack: 2,
    health: 1,
    onDeath: [{ kind: 'damage', amount: 1, target: 'enemy-hero' }],
    flavor: { en: 'The tithe is collected even after the collector is dead.', fr: 'La dime se leve meme apres la mort du collecteur.' }
  },
  {
    id: parseId('card', 'customs-pikeman'),
    name: { en: 'Customs Pikeman', fr: 'Piquier des Douanes' },
    faction: 'exchequer',
    family: 'bound',
    rarity: 'common',
    cost: 3,
    unique: false,
    attack: 2,
    health: 5,
    keywords: ['shield-wall'],
    flavor: { en: 'Declare everything. Then declare it again.', fr: 'Declarez tout. Puis declarez-le encore.' }
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
    flavor: { en: 'Paid in full, or paid in kind.', fr: 'Paye en totalite, ou paye en nature.' }
  },
  {
    id: parseId('card', 'surveyor-pell'),
    name: { en: 'Surveyor Pell', fr: 'Arpenteur Pell' },
    faction: 'exchequer',
    family: 'bound',
    rarity: 'rare',
    cost: 3,
    unique: false,
    attack: 2,
    health: 3,
    onPlay: [{ kind: 'damage', amount: 1, target: 'chosen-enemy-minion' }],
    flavor: { en: 'Every wall gets measured. Some get measured down.', fr: 'Chaque mur est mesure. Certains sont mesures a la baisse.' }
  },
  {
    id: parseId('card', 'collector-brandt'),
    name: { en: 'Collector Brandt', fr: 'Percepteur Brandt' },
    faction: 'exchequer',
    family: 'bound',
    rarity: 'rare',
    cost: 4,
    unique: false,
    attack: 3,
    health: 5,
    flavor: { en: 'Brandt never raises his voice. He raises the interest.', fr: "Brandt ne hausse jamais la voix. Il hausse l'interet." }
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
    flavor: { en: 'The wax is still warm. So is the warrant.', fr: 'La cire est encore tiede. Le mandat aussi.' }
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
  },
  {
    id: parseId('card', 'chain-marshal'),
    name: { en: 'Chain-Marshal', fr: 'Marechal des Chaines' },
    faction: 'exchequer',
    family: 'bound',
    rarity: 'epic',
    cost: 6,
    unique: false,
    attack: 6,
    health: 7,
    flavor: { en: 'The last audit is the loudest.', fr: 'Le dernier audit est le plus bruyant.' }
  },
  {
    id: parseId('card', 'assessors-pike'),
    name: { en: "Assessor's Pike", fr: "Pique de l'Assesseur" },
    faction: 'exchequer',
    family: 'iron',
    rarity: 'common',
    cost: 2,
    unique: false,
    attack: 2,
    durability: 2,
    flavor: { en: 'Measured twice, driven once.', fr: 'Mesuree deux fois, plantee une fois.' }
  },
  {
    id: parseId('card', 'toll-bridge'),
    name: { en: 'Toll-Bridge', fr: 'Pont a Peage' },
    faction: 'exchequer',
    family: 'holding',
    rarity: 'rare',
    cost: 3,
    unique: false,
    durability: 3,
    effects: [{ kind: 'tariff', amount: 1 }],
    flavor: { en: 'Every crossing is logged. Every log is billed.', fr: 'Chaque passage est consigne. Chaque consignation est facturee.' }
  },
  {
    id: parseId('card', 'distraint-notice'),
    name: { en: 'Distraint Notice', fr: 'Avis de Saisie' },
    faction: 'exchequer',
    family: 'snare',
    rarity: 'rare',
    cost: 2,
    unique: false,
    trigger: 'enemy-play',
    effects: [{ kind: 'damage', amount: 2, target: 'enemy-hero' }],
    flavor: { en: 'Posted on the door before the debtor reads it.', fr: "Affiche sur la porte avant que le debiteur ne la lise." }
  },
  {
    id: parseId('card', 'oath-of-collection'),
    name: { en: 'Oath of Collection', fr: 'Serment de Recouvrement' },
    faction: 'exchequer',
    family: 'oath',
    rarity: 'epic',
    cost: 2,
    unique: false,
    goal: 3,
    effects: [{ kind: 'draw', count: 2 }, { kind: 'heal', amount: 3, target: 'own-hero' }],
    flavor: { en: 'Three accounts closed, and the ledger balances itself.', fr: 'Trois comptes clos, et le registre s equilibre de lui-meme.' }
  },
  {
    id: parseId('card', 'writ-of-seizure'),
    name: { en: 'Writ of Seizure', fr: 'Mandat de Saisie' },
    faction: 'exchequer',
    family: 'writ',
    rarity: 'common',
    cost: 2,
    unique: false,
    effects: [{ kind: 'damage', amount: 3, target: 'chosen-enemy-minion' }],
    flavor: { en: "Item four: the debtor's chattels, forfeit.", fr: 'Article quatre : les biens du debiteur sont saisis.' }
  },
  {
    id: parseId('card', 'writ-of-levy'),
    name: { en: 'Writ of Levy', fr: 'Mandat de Levee' },
    faction: 'exchequer',
    family: 'writ',
    rarity: 'common',
    cost: 3,
    unique: false,
    effects: [{ kind: 'draw', count: 2 }],
    flavor: { en: 'Take what is owed. Then take a little more.', fr: 'Prenez ce qui est du. Puis un peu plus.' }
  },
  {
    id: parseId('card', 'audit-of-arrears'),
    name: { en: 'Audit of Arrears', fr: 'Audit des Arrieres' },
    faction: 'exchequer',
    family: 'writ',
    rarity: 'rare',
    cost: 4,
    unique: false,
    effects: [{ kind: 'damage', amount: 2, target: 'all-enemy-minions' }],
    flavor: { en: 'The ledger is read aloud. Nobody enjoys it.', fr: "On lit le registre a voix haute. Personne n'aime ca." }
  }
]

const STARTER_PICKS = [
  'tally-clerk',
  'iron-clad-levy',
  'toll-warden',
  'distraint-notice',
  'customs-pikeman',
  'bailiff-vane',
  'surveyor-pell',
  'collector-brandt',
  'oath-of-collection',
  'chain-marshal',
  'assessors-pike',
  'toll-bridge',
  'writ-of-seizure',
  'writ-of-levy',
  'audit-of-arrears'
]

export const EXCHEQUER_DECK: readonly Id<'card'>[] = STARTER_PICKS.flatMap((pick) => {
  const id = parseId('card', pick)
  return [id, id]
})