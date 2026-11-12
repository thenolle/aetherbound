import type { CardDefinition, HeroDefinition } from '../shared/cards'
import type { Effect } from '../shared/effects'
import { parseId } from '../shared/ids'
import type { Id } from '../shared/ids'
import { defineCard } from './builder'

type DefineArgs = Parameters<typeof defineCard> extends [unknown, ...infer Rest] ? Rest : never

const card = (...args: DefineArgs): CardDefinition => defineCard('glass-eye', ...args)
const copy = (count: number): Effect => ({ kind: 'steal', count, take: false })
const take = (count: number): Effect => ({ kind: 'steal', count, take: true })

const forge: Effect = { kind: 'counterfeit' }

export const GLASS_EYE_HERO: HeroDefinition = {
  id: parseId('hero', 'whisper-broker-isaure-pell'),
  name: { en: 'Isaure Pell', fr: 'Isaure Pell' },
  title: { en: 'Whisper-Broker', fr: 'Courtier de Murmures' },
  faction: 'glass-eye',
  health: 30,
  ability: { name: { en: 'Clip the Coin', fr: 'Rogner la Piece' }, cost: 1, effects: [copy(1)] }
}

export const GLASS_EYE_CARDS: readonly CardDefinition[] = [
  card('clipped-coin-runner', 'bound', 'common', 1, ['Clipped-Coin Runner', 'Coursier de la Piece Rognee'], ['Pays in coin, a little lighter each time.', 'Paie en pieces, un peu plus legeres a chaque fois.'], { attack: 2, health: 2 }),
  card('pickpocket', 'bound', 'common', 2, ['Pickpocket', 'Coupe-Bourse'], ['You will not feel it. You will notice later.', 'Vous ne le sentirez pas. Vous le remarquerez plus tard.'], { attack: 2, health: 2 }, { onPlay: [copy(1)] }),
  card('tunnel-smuggler', 'bound', 'common', 2, ['Tunnel-Smuggler', 'Passeur des Souterrains'], ['Everything fits in a drowned crate.', 'Tout tient dans une caisse noyee.'], { attack: 2, health: 2 }),
  card('cistern-lookout', 'bound', 'common', 2, ['Cistern Lookout', 'Guetteur de la Citerne'], ['He counts footsteps, not faces.', 'Il compte les pas, pas les visages.'], { attack: 2, health: 4 }),
  card('whisper-broker', 'bound', 'common', 3, ['Whisper-Broker', 'Courtier de Murmures'], ['A secret is only a coin that talks.', "Un secret n'est qu'une piece qui parle."], { attack: 2, health: 3 }, { onPlay: [take(1)] }),
  card('false-ledger-clerk', 'bound', 'common', 3, ['False-Ledger Clerk', 'Commis au Faux Registre'], ['Two books. One true. He forgets which.', 'Deux registres. Un vrai. Il oublie lequel.'], { attack: 2, health: 4 }, { onDeath: [copy(1)] }),
  card('glass-eyed-informant', 'bound', 'rare', 3, ['Glass-Eyed Informant', "Indicateur a l'Oeil de Verre"], ['He saw nothing. He will describe it.', "Il n'a rien vu. Il le decrira."], { attack: 3, health: 2 }, { onPlay: [{ kind: 'draw', count: 1 }] }),
  card('forger', 'bound', 'rare', 4, ['Forger', 'Faussaire'], ['Every original is a rough draft.', 'Tout original est un brouillon.'], { attack: 3, health: 3 }, { onPlay: [forge] }),
  card('sewer-captain', 'bound', 'rare', 5, ['Sewer-Captain', 'Capitaine des Egouts'], ['The flood is his, and what it carries.', "La crue est a lui, et ce qu'elle charrie."], { attack: 4, health: 5 }, { onPlay: [copy(2)] }),
  card('grand-counterfeiter', 'bound', 'epic', 6, ['Grand Counterfeiter', 'Grand Faux-Monnayeur'], ['The seal is perfect. That is the crime.', "Le sceau est parfait. C'est le crime."], { attack: 5, health: 5 }, { onPlay: [forge, { kind: 'draw', count: 1 }] }),
  card('the-cistern-king', 'bound', 'legendary', 7, ['The Cistern King', 'Le Roi de la Citerne'], ['Below the capital, he is the capital.', 'Sous la capitale, il est la capitale.'], { attack: 6, health: 6 }, { unique: true, onPlay: [forge, copy(2)] }),
  card('folding-knife', 'iron', 'common', 2, ['Folding Knife', 'Couteau Pliant'], ['Quiet. Quick. Easy to lose.', 'Silencieux. Rapide. Facile a perdre.'], { attack: 2 }, { durability: 2 }),
  card('forged-writ', 'writ', 'common', 2, ['Forged Writ', 'Mandat Falsifie'], ['Same stamp. Different hand.', 'Meme sceau. Autre main.'], {}, { effects: [forge] }),
  card('writ-of-clipping', 'writ', 'common', 2, ['Writ of Clipping', 'Mandat de Rognage'], ['A little off every coin.', 'Un peu de chaque piece.'], {}, { effects: [take(2)] }),
  card('smugglers-tunnel', 'holding', 'common', 2, ["Smuggler's Tunnel", 'Tunnel du Passeur'], ['No toll. No ledger. No questions.', 'Pas de peage. Pas de registre. Pas de questions.'], {}, { durability: 3, effects: [copy(1)] }),
  card('whispered-warning', 'snare', 'common', 1, ['Whispered Warning', 'Avertissement Chuchote'], ['Heard before it was said.', "Entendu avant d'etre dit."], {}, { trigger: 'enemy-play', effects: [copy(1)] })
]
export const GLASS_EYE_DECK: readonly Id<'card'>[] = GLASS_EYE_CARDS.filter((entry) => !entry.unique && entry.token !== true).flatMap((entry) => [entry.id, entry.id])