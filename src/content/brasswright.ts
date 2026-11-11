import type { CardDefinition, HeroDefinition } from '../shared/cards'
import type { Effect } from '../shared/effects'
import { parseId } from '../shared/ids'
import type { Id } from '../shared/ids'
import { defineCard } from './builder'

const AUTOMATON = parseId('card', 'brass-automaton')

const automata = (count: number): Effect => ({ kind: 'summon', cardId: AUTOMATON, attack: 2, health: 2, count })

const surge = (amount: number): Effect => ({ kind: 'surge', amount })

const buff = (attack: number, health: number): Effect => ({ kind: 'buff', attack, health })

type DefineArgs = Parameters<typeof defineCard> extends [unknown, ...infer Rest] ? Rest : never

const card = (...args: DefineArgs): CardDefinition => defineCard('brasswright', ...args)

export const BRASSWRIGHT_HERO: HeroDefinition = {
  id: parseId('hero', 'valve-master-corvus-hale'),
  name: { en: 'Corvus Hale', fr: 'Corvus Hale' },
  title: { en: 'Valve-Master', fr: 'Maitre des Vannes' },
  faction: 'brasswright',
  health: 30,
  ability: { name: { en: 'Overclock', fr: 'Surcharge' }, cost: 2, effects: [surge(3)] }
}

export const BRASSWRIGHT_CARDS: readonly CardDefinition[] = [
  card('brass-automaton', 'bound', 'common', 0, ['Brass Automaton', 'Automate de Laiton'], ['Wound tight. Pointed. Released.', 'Remonte. Oriente. Libere.'], { attack: 2, health: 2 }, { token: true }),
  card('rivet-boy', 'bound', 'common', 1, ['Rivet-Boy', 'Garcon de Rivets'], ['Hired for his small hands.', 'Engage pour ses petites mains.'], { attack: 1, health: 2 }),
  card('boiler-tender', 'bound', 'common', 2, ['Boiler-Tender', 'Chauffeur de Chaudiere'], ['Keeps the pressure honest.', 'Garde la pression honnete.'], { attack: 1, health: 3 }, { onPlay: [surge(1)] }),
  card('clockwork-hound', 'bound', 'common', 2, ['Clockwork Hound', 'Limier Mecanique'], ['Even scrap has a second shift.', 'Meme la ferraille a une seconde equipe.'], { attack: 2, health: 2 }, { onDeath: [automata(1)] }),
  card('automaton-wright', 'bound', 'common', 3, ['Automaton-Wright', "Cuivrier d'Automates"], ['Assembled, not born. Therefore reliable.', 'Assemble, non ne. Donc fiable.'], { attack: 2, health: 3 }, { onPlay: [automata(1)] }),
  card('brass-sentinel', 'bound', 'common', 3, ['Brass Sentinel', 'Sentinelle de Laiton'], ['It does not tire. It does tarnish.', 'Elle ne se fatigue pas. Elle ternit.'], { attack: 2, health: 5 }, { keywords: ['shield-wall'] }),
  card('soot-engineer', 'bound', 'common', 3, ['Soot-Engineer', 'Ingenieur de Suie'], ['Everything can be made to last one more day.', 'Tout peut durer un jour de plus.'], { attack: 2, health: 3 }, { onPlay: [{ kind: 'forge', attack: 1, durability: 1 }] }),
  card('foreman', 'bound', 'rare', 4, ['Foreman', 'Contremaitre'], ['He inspects the rigs. The rigs improve.', "Il inspecte les engins. Les engins s'ameliorent."], { attack: 2, health: 4 }, { onPlay: [buff(1, 1)] }),
  card('valve-warden', 'bound', 'rare', 5, ['Valve-Warden', 'Gardien des Vannes'], ['Opens nothing without a signature.', "N'ouvre rien sans signature."], { attack: 4, health: 6 }, { keywords: ['shield-wall'], onPlay: [surge(2)] }),
  card('rivet-colossus', 'bound', 'epic', 7, ['Rivet Colossus', 'Colosse a Rivets'], ['Four hundred rivets. One opinion.', 'Quatre cents rivets. Une opinion.'], { attack: 7, health: 9 }),
  card('the-grand-orrery', 'bound', 'legendary', 6, ['The Grand Orrery', 'Le Grand Planetaire'], ['It models the world. The world complies.', "Il modelise le monde. Le monde s'y conforme."], { attack: 5, health: 7 }, { unique: true, keywords: ['shield-wall'], onPlay: [buff(1, 1)] }),
  card('pressure-lance', 'iron', 'rare', 4, ['Pressure Lance', 'Lance sous Pression'], ['Do not hold it by the valve.', 'Ne la tenez pas par la soupape.'], { attack: 4 }, { durability: 2 }),
  card('writ-of-tempering', 'writ', 'common', 2, ['Writ of Tempering', 'Mandat de Trempe'], ['Quenched, stamped, filed.', 'Trempe, estampille, classe.'], {}, { effects: [{ kind: 'forge', attack: 1, durability: 2 }, { kind: 'draw', count: 1 }] }),
  card('writ-of-assembly', 'writ', 'rare', 4, ['Writ of Assembly', "Mandat d'Assemblage"], ['Parts list attached. Souls optional.', 'Liste des pieces jointe. Ames facultatives.'], {}, { effects: [automata(2), buff(1, 0)] }),
  card('boiler-room', 'holding', 'common', 3, ['Boiler Room', 'Salle des Chaudieres'], ['Hot enough to argue with.', 'Assez chaude pour discuter.'], {}, { durability: 2, effects: [surge(2)] }),
  card('relief-valve', 'snare', 'common', 2, ['Relief Valve', 'Soupape de Surete'], ['It lets go before it breaks.', 'Elle lache avant de rompre.'], {}, { trigger: 'enemy-attack', effects: [{ kind: 'heal', amount: 3, target: 'own-hero' }] }),
  card('oath-of-the-master-rig', 'oath', 'epic', 3, ['Oath of the Master Rig', 'Serment du Grand Engin'], ['Three builds, then the rig is yours.', "Trois constructions, puis l'engin est a vous."], {}, { goal: 3, effects: [automata(2), buff(1, 1)] })
]
export const BRASSWRIGHT_DECK: readonly Id<'card'>[] = BRASSWRIGHT_CARDS.filter((entry) => !entry.unique && entry.token !== true).flatMap((entry) => [entry.id, entry.id])