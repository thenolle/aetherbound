import type { CardDefinition, HeroDefinition } from '../shared/cards'
import type { Effect } from '../shared/effects'
import { parseId } from '../shared/ids'
import type { Id } from '../shared/ids'
import { defineCard } from './builder'

const HUSK = parseId('card', 'hollow-husk')

const raise = (count: number): Effect => ({ kind: 'raise', cardId: HUSK, attack: 2, health: 1, count })
const drain = (amount: number): Effect => ({ kind: 'drain', amount })

type DefineArgs = Parameters<typeof defineCard> extends [unknown, ...infer Rest] ? Rest : never

const card = (...args: DefineArgs): CardDefinition => defineCard('choir', ...args)

export const CHOIR_HERO: HeroDefinition = {
  id: parseId('hero', 'bell-warden-cassian-thole'),
  name: { en: 'Cassian Thole', fr: 'Cassian Thole' },
  title: { en: 'Knell-Monk', fr: 'Moine du Glas' },
  faction: 'choir',
  health: 30,
  ability: { name: { en: 'Toll Bell', fr: 'Sonner le Glas' }, cost: 1, effects: [drain(1)] }
}

export const CHOIR_CARDS: readonly CardDefinition[] = [
  card('hollow-husk', 'bound', 'common', 0, ['Hollow Husk', 'Carcasse Creuse'], ['It answers to the bell, not the name.', 'Elle repond a la cloche, pas au nom.'], { attack: 2, health: 1 }, { token: true }),
  card('bell-novice', 'bound', 'common', 1, ['Bell-Novice', 'Novice de la Cloche'], ['He rings what he is told to ring.', "Il sonne ce qu'on lui dit de sonner."], { attack: 1, health: 2 }),
  card('candle-bearer', 'bound', 'common', 1, ['Candle-Bearer', 'Porte-Cierge'], ['A small light, handed on.', 'Une petite lumiere, transmise.'], { attack: 1, health: 1 }, { onDeath: [drain(1)] }),
  card('grave-digger', 'bound', 'common', 2, ['Grave-Digger', 'Fossoyeur'], ['Dug deep. Not deep enough.', 'Creuse profond. Pas assez.'], { attack: 2, health: 3 }, { onPlay: [raise(1)] }),
  card('echo-chanter', 'bound', 'common', 3, ['Echo-Chanter', "Chantre de l'Echo"], ['The last note is sung twice.', 'La derniere note est chantee deux fois.'], { attack: 2, health: 3 }, { keywords: ['echo'], onDeath: [drain(1)] }),
  card('pallbearer', 'bound', 'common', 3, ['Pallbearer', 'Porteur de Cercueil'], ['Slow, because the weight is not only wood.', "Lent, car le poids n'est pas que du bois."], { attack: 2, health: 5 }, { keywords: ['shield-wall'] }),
  card('alms-monk', 'bound', 'common', 3, ['Alms-Monk', 'Moine Quemandeur'], ['He collects for those past collecting.', 'Il quete pour ceux qui ne peuvent plus.'], { attack: 3, health: 3 }, { onDeath: [{ kind: 'draw', count: 1 }] }),
  card('mourning-cantor', 'bound', 'rare', 4, ['Mourning Cantor', 'Chantre du Deuil'], ['He sings the names. They answer.', 'Il chante les noms. Ils repondent.'], { attack: 3, health: 4 }, { onPlay: [raise(2)] }),
  card('ossuary-warden', 'bound', 'rare', 4, ['Ossuary Warden', "Gardien de l'Ossuaire"], ['The count must be kept.', 'Le compte doit etre tenu.'], { attack: 3, health: 5 }, { keywords: ['echo'], onDeath: [raise(1)] }),
  card('tolling-abbess', 'bound', 'rare', 5, ['Tolling Abbess', 'Abbesse du Glas'], ['Each stroke costs someone.', "Chaque coup coute a quelqu'un."], { attack: 4, health: 6 }, { onPlay: [drain(3)] }),
  card('the-last-sexton', 'bound', 'legendary', 7, ['The Last Sexton', 'Le Dernier Sacristain'], ['He has buried the city twice.', 'Il a enterre la ville deux fois.'], { attack: 6, health: 7 }, { unique: true, keywords: ['echo'], onDeath: [raise(2), drain(2)] }),
  card('bronze-handbell', 'iron', 'common', 2, ['Bronze Handbell', 'Clochette de Bronze'], ['Struck once, it is heard everywhere.', "Frappee une fois, elle s'entend partout."], { attack: 2 }, { durability: 2 }),
  card('writ-of-requiem', 'writ', 'common', 2, ['Writ of Requiem', 'Mandat de Requiem'], ['Read aloud, as is the custom.', "Lu a voix haute, comme le veut l'usage."], {}, { effects: [raise(2), drain(1)] }),
  card('writ-of-last-rites', 'writ', 'rare', 3, ['Writ of Last Rites', 'Mandat des Derniers Sacrements'], ['The sentence and the service, together.', "La sentence et l'office, ensemble."], {}, { effects: [{ kind: 'damage', amount: 3, target: 'chosen-enemy-minion' }, raise(1)] }),
  card('charnel-vault', 'holding', 'common', 3, ['Charnel Vault', 'Charnier'], ['Nothing leaves. Some things return.', 'Rien ne sort. Certaines choses reviennent.'], {}, { durability: 3, effects: [raise(1)] }),
  card('funeral-bell', 'snare', 'common', 2, ['Funeral Bell', 'Cloche Funebre'], ['Rung for the one who just arrived.', "Sonnee pour celui qui vient d'arriver."], {}, { trigger: 'enemy-play', effects: [drain(2)] }),
  card('oath-of-unpaid-debts', 'oath', 'epic', 3, ['Oath of Unpaid Debts', 'Serment des Dettes Impayees'], ['Three paid, and the rest are called in.', 'Trois payees, et les autres sont reclamees.'], {}, { goal: 2, effects: [raise(3), { kind: 'heal', amount: 4, target: 'own-hero' }] })
]
export const CHOIR_DECK: readonly Id<'card'>[] = CHOIR_CARDS.filter((entry) => !entry.unique && entry.token !== true).flatMap((entry) => [entry.id, entry.id])