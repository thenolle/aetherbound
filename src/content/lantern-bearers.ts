import type { CardDefinition, HeroDefinition } from '../shared/cards'
import type { Effect } from '../shared/effects'
import { parseId } from '../shared/ids'
import type { Id } from '../shared/ids'
import { defineCard } from './builder'

type DefineArgs = Parameters<typeof defineCard> extends [unknown, ...infer Rest] ? Rest : never

const card = (...args: DefineArgs): CardDefinition => defineCard('lantern-bearers', ...args)

const mend = (amount: number): Effect => ({ kind: 'heal', amount, target: 'own-hero' })

const ward: Effect = { kind: 'ward' }

export const LANTERN_BEARERS_HERO: HeroDefinition = {
  id: parseId('hero', 'hospitaller-marguerite-aldane'),
  name: { en: 'Marguerite Aldane', fr: 'Marguerite Aldane' },
  title: { en: 'Lamp-Bearer', fr: 'Porteuse de Lanterne' },
  faction: 'lantern-bearers',
  health: 30,
  ability: { name: { en: 'Kindle the Lamp', fr: 'Allumer la Lampe' }, cost: 2, effects: [mend(2)] }
}

export const LANTERN_BEARERS_CARDS: readonly CardDefinition[] = [
  card('lamp-novice', 'bound', 'common', 1, ['Lamp-Novice', 'Novice de la Lampe'], ['She keeps the wick trimmed and her promises short.', 'Elle taille la meche et raccourcit ses promesses.'], { attack: 1, health: 3 }),
  card('ward-sister', 'bound', 'common', 2, ['Ward-Sister', 'Soeur de la Garde'], ['The glass remembers every blow it refused.', 'Le verre se souvient de chaque coup refuse.'], { attack: 2, health: 2 }, { keywords: ['glass-ward'] }),
  card('hospital-porter', 'bound', 'common', 2, ['Hospital Porter', 'Brancardier'], ['He carries what cannot walk.', 'Il porte ce qui ne peut marcher.'], { attack: 1, health: 4 }, { onPlay: [mend(2)] }),
  card('salve-bearer', 'bound', 'common', 3, ['Salve-Bearer', "Porteuse d'Onguent"], ['Applied evenly, as the rule requires.', "Appliquee uniformement, comme l'exige la regle."], { attack: 2, health: 3 }, { onPlay: [{ kind: 'heal', amount: 3, target: 'all-own-minions' }] }),
  card('hospitaller-knight', 'bound', 'common', 4, ['Hospitaller Knight', 'Chevalier Hospitalier'], ['Armour for the wounded, mostly his own.', 'Une armure pour les blesses, surtout les siens.'], { attack: 4, health: 4 }, { onPlay: [mend(2)] }),
  card('glass-warden', 'bound', 'rare', 4, ['Glass Warden', 'Gardien de Verre'], ['Two defences. He trusts neither.', 'Deux defenses. Il ne se fie a aucune.'], { attack: 3, health: 5 }, { keywords: ['shield-wall', 'glass-ward'] }),
  card('abbess-of-the-pure-lamp', 'bound', 'rare', 5, ['Abbess of the Pure Lamp', 'Abbesse de la Lampe Pure'], ['She tests the faithful by the length of their patience.', 'Elle eprouve les fideles a la longueur de leur patience.'], { attack: 4, health: 6 }, { onPlay: [mend(4), ward] }),
  card('miracle-worker', 'bound', 'epic', 6, ['Miracle-Worker', 'Faiseur de Miracles'], ['Medicine, plus an unreasonable number of witnesses.', 'De la medecine, plus un nombre deraisonnable de temoins.'], { attack: 5, health: 7 }, { onPlay: [{ kind: 'if_healed', threshold: 8, then: [{ kind: 'damage', amount: 4, target: 'enemy-hero' }, { kind: 'draw', count: 2 }] }] }),
  card('the-blind-abbess', 'bound', 'legendary', 7, ['The Blind Abbess', "L'Abbesse Aveugle"], ['She cannot see the lamp. She is the lamp.', 'Elle ne voit pas la lampe. Elle est la lampe.'], { attack: 6, health: 8 }, { unique: true, keywords: ['glass-ward'], onPlay: [mend(6), { kind: 'if_healed', threshold: 12, then: [{ kind: 'damage', amount: 3, target: 'all-enemy-minions' }] }] }),
  card('lantern-staff', 'iron', 'common', 2, ['Lantern Staff', 'Baton de Lanterne'], ['A light at one end. A weight at the other.', "Une lumiere d'un cote. Un poids de l'autre."], { attack: 2 }, { durability: 2 }),
  card('writ-of-mending', 'writ', 'common', 2, ['Writ of Mending', 'Mandat de Guerison'], ['Stamped, signed, closed.', 'Estampille, signe, clos.'], {}, { effects: [mend(5), { kind: 'draw', count: 1 }] }),
  card('writ-of-sanctuary', 'writ', 'rare', 3, ['Writ of Sanctuary', 'Mandat de Sanctuaire'], ['A door that opens only inward.', "Une porte qui ne s'ouvre que vers l'interieur."], {}, { effects: [ward, { kind: 'heal', amount: 2, target: 'all-own-minions' }] }),
  card('writ-of-radiance', 'writ', 'rare', 4, ['Writ of Radiance', 'Mandat de Rayonnement'], ['The lamp was always this bright. You were looking away.', 'La lampe a toujours brille ainsi. Vous regardiez ailleurs.'], {}, { effects: [mend(2), { kind: 'if_healed', threshold: 6, then: [{ kind: 'damage', amount: 3, target: 'all-enemy-minions' }] }] }),
  card('infirmary', 'holding', 'common', 3, ['Infirmary', 'Infirmerie'], ['Quiet beds. Loud bells.', 'Lits silencieux. Cloches bruyantes.'], {}, { durability: 3, effects: [mend(2)] }),
  card('vigil', 'snare', 'common', 2, ['Vigil', 'Veillee'], ['Kept all night, for this.', 'Tenue toute la nuit, pour ceci.'], {}, { trigger: 'enemy-attack', effects: [mend(4), ward] }),
  card('oath-of-the-last-well', 'oath', 'epic', 3, ['Oath of the Last Well', 'Serment du Dernier Puits'], ['Three vigils kept, and the well answers.', 'Trois veillees tenues, et le puits repond.'], {}, { goal: 3, effects: [mend(6), ward] })
]

export const LANTERN_BEARERS_DECK: readonly Id<'card'>[] = LANTERN_BEARERS_CARDS
  .filter((entry) => !entry.unique && entry.token !== true)
  .flatMap((entry) => [entry.id, entry.id])