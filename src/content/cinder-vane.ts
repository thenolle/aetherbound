import type { CardDefinition, HeroDefinition } from '../shared/cards'
import type { Effect } from '../shared/effects'
import { parseId } from '../shared/ids'
import type { Id } from '../shared/ids'
import { defineCard } from './builder'

type DefineArgs = Parameters<typeof defineCard> extends [unknown, ...infer Rest] ? Rest : never

const card = (...args: DefineArgs): CardDefinition => defineCard('cinder-vane', ...args)

const selfBurn = (amount: number): Effect => ({ kind: 'damage', amount, target: 'own-hero' })

export const CINDER_VANE_HERO: HeroDefinition = {
  id: parseId('hero', 'trench-captain-rosalind-ash'),
  name: { en: 'Rosalind Ash', fr: 'Rosalind Ash' },
  title: { en: 'Vent-Raider', fr: 'Pilleuse des Soupapes' },
  faction: 'cinder-vane',
  health: 30,
  ability: { name: { en: 'Vent Valve', fr: 'Ouvrir la Soupape' }, cost: 0, effects: [selfBurn(2), { kind: 'surge', amount: 2 }] }
}

export const CINDER_VANE_CARDS: readonly CardDefinition[] = [
  card('ash-runner', 'bound', 'common', 1, ['Ash-Runner', 'Coureur de Cendre'], ['No time to look back. No wish to.', "Pas le temps de regarder en arriere. Pas l'envie non plus."], { attack: 2, health: 1 }, { keywords: ['haste'] }),
  card('trench-raider', 'bound', 'common', 2, ['Trench-Raider', 'Pilleur de Tranchee'], ['He signs for nothing and takes the rest.', 'Il ne signe rien et prend le reste.'], { attack: 2, health: 2 }, { keywords: ['haste'] }),
  card('flare-bearer', 'bound', 'common', 2, ['Flare-Bearer', 'Porte-Fusee'], ['Lit before the order is given.', "Allumee avant que l'ordre soit donne."], { attack: 2, health: 2 }, { onPlay: [{ kind: 'damage', amount: 1, target: 'enemy-hero' }] }),
  card('fissure-hound', 'bound', 'common', 2, ['Fissure-Hound', 'Limier de la Fissure'], ['It runs where the ground is warm.', 'Il court la ou le sol est tiede.'], { attack: 2, health: 3 }),
  card('scorched-sapper', 'bound', 'common', 3, ['Scorched Sapper', 'Sapeur Roussi'], ['Short fuse, long reach.', 'Meche courte, longue portee.'], { attack: 3, health: 2 }, { onDeath: [{ kind: 'damage', amount: 2, target: 'enemy-hero' }] }),
  card('self-venting-gunner', 'bound', 'common', 3, ['Self-Venting Gunner', 'Tireur sous Pression'], ['The tank hisses. He grins.', 'Le reservoir siffle. Il sourit.'], { attack: 4, health: 3 }, { onPlay: [selfBurn(2)] }),
  card('breach-captain', 'bound', 'rare', 4, ['Breach-Captain', 'Capitaine de Breche'], ['First through, last to explain.', "Premier passe, dernier a s'expliquer."], { attack: 4, health: 3 }, { keywords: ['haste'] }),
  card('ember-sergeant', 'bound', 'rare', 4, ['Ember-Sergeant', 'Sergent de Braise'], ['He marks the line with sparks.', "Il marque la ligne a coups d'etincelles."], { attack: 3, health: 5 }, { onPlay: [{ kind: 'damage', amount: 1, target: 'all-enemy-minions' }] }),
  card('kiln-walker', 'bound', 'epic', 6, ['Kiln-Walker', 'Marcheur du Four'], ['Built to fail loudly.', 'Concu pour tomber bruyamment.'], { attack: 8, health: 5 }, { onPlay: [selfBurn(3)] }),
  card('the-fissure-wolf', 'bound', 'legendary', 5, ['The Fissure Wolf', 'Le Loup de la Fissure'], ['It was fed. It remembers.', 'Il a ete nourri. Il se souvient.'], { attack: 7, health: 4 }, { unique: true, keywords: ['haste'] }),
  card('ash-mortar', 'iron', 'rare', 3, ['Ash Mortar', 'Mortier de Cendre'], ['It was a drain pipe yesterday.', "C'etait un tuyau d'evacuation hier."], { attack: 3 }, { durability: 2 }),
  card('writ-of-rupture', 'writ', 'rare', 3, ['Writ of Rupture', 'Mandat de Rupture'], ['The tank is opened by the hand that feeds it.', 'Le reservoir est ouvert par la main qui le nourrit.'], {}, { effects: [{ kind: 'rupture', count: 1 }] }),
  card('writ-of-venting', 'writ', 'common', 1, ['Writ of Venting', 'Mandat de Decharge'], ['Pressure is a debt. Pay it forward.', "La pression est une dette. Payez-la d'avance."], {}, { effects: [selfBurn(2), { kind: 'surge', amount: 2 }, { kind: 'draw', count: 1 }] }),
  card('spark-works', 'holding', 'common', 2, ['Spark Works', 'Atelier des Etincelles'], ['Always running. Never inspected.', 'Toujours en marche. Jamais inspecte.'], {}, { durability: 3, effects: [{ kind: 'damage', amount: 1, target: 'enemy-hero' }] }),
  card('tripwire', 'snare', 'common', 2, ['Tripwire', 'Fil de Declenchement'], ['A very short conversation.', 'Une conversation tres breve.'], {}, { trigger: 'enemy-play', effects: [{ kind: 'damage', amount: 1, target: 'all-enemy-minions' }] }),
  card('oath-of-the-open-valve', 'oath', 'epic', 2, ['Oath of the Open Valve', 'Serment de la Soupape Ouverte'], ['Three crossings, then nothing held back.', 'Trois traversees, puis plus rien de retenu.'], {}, { goal: 3, effects: [{ kind: 'surge', amount: 4 }, { kind: 'draw', count: 2 }] })
]
export const CINDER_VANE_DECK: readonly Id<'card'>[] = CINDER_VANE_CARDS.filter((entry) => !entry.unique && entry.token !== true).flatMap((entry) => [entry.id, entry.id])