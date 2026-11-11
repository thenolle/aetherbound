import type { CardDefinition, HeroDefinition } from '../shared/cards'
import { parseId } from '../shared/ids'
import type { Id } from '../shared/ids'
import type { CardFamilyId, RarityId } from '../shared/lexicon'

type Extra = Partial<Pick<CardDefinition, 'keywords' | 'effects' | 'onPlay' | 'onDeath' | 'trigger' | 'durability' | 'unique'>>

type Stats = Readonly<{ attack?: number, health?: number }>

function card(id: string, family: CardFamilyId, rarity: RarityId, cost: number, names: readonly [string, string], flavor: readonly [string, string], stats: Stats, extra: Extra = {}): CardDefinition {
  return {
    id: parseId('card', id),
    name: { en: names[0], fr: names[1] },
    faction: 'brine-lock',
    family,
    rarity,
    cost,
    unique: false,
    ...stats,
    ...extra,
    flavor: { en: flavor[0], fr: flavor[1] }
  }
}

export const BRINE_LOCK_HERO: HeroDefinition = {
  id: parseId('hero', 'lock-warden-anselm-rook'),
  name: { en: 'Anselm Rook', fr: 'Anselm Rook' },
  title: { en: 'Glacier-Lock Keeper', fr: "Gardien de l'Ecluse Glaciale" },
  faction: 'brine-lock',
  health: 30,
  ability: {
    name: { en: 'Frost-Lock', fr: 'Verrou de Givre' },
    cost: 2,
    effects: [{ kind: 'freeze', target: 'chosen-enemy-minion' }]
  }
}

export const BRINE_LOCK_CARDS: readonly CardDefinition[] = [
  card('brine-hand', 'bound', 'common', 1, ['Brine-Hand', 'Main de Saumure'], ['Salt keeps the hands honest.', 'Le sel garde les mains honnetes.'], { attack: 1, health: 2 }),
  card('tide-clerk', 'bound', 'common', 1, ['Tide-Clerk', 'Commis des Marees'], ['He logs the tide and the thefts alike.', 'Il consigne les marees et les vols avec le meme soin.'], { attack: 2, health: 1 }),
  card('rime-deckhand', 'bound', 'common', 2, ['Rime-Deckhand', 'Matelot du Givre'], ['Frost on the rope is a kind of weather report.', 'Du givre sur le cordage tient lieu de bulletin meteo.'], { attack: 2, health: 3 }),
  card('fog-signaler', 'bound', 'common', 2, ['Fog-Signaler', 'Signaleur de Brume'], ['Three short blasts: stand still.', 'Trois coups brefs : ne bougez plus.'], { attack: 1, health: 3 }, { onPlay: [{ kind: 'freeze', target: 'chosen-enemy-minion' }] }),
  card('gale-rigger', 'bound', 'common', 3, ['Gale-Rigger', 'Greeur de Grains'], ['The wind pays by the hour.', "Le vent paie a l'heure."], { attack: 3, health: 3 }, { keywords: ['haste'] }),
  card('fog-barge', 'bound', 'common', 3, ['Fog-Barge', 'Barge de Brume'], ['Even wrecks keep their manifests.', 'Meme les epaves gardent leur manifeste.'], { attack: 2, health: 4 }, { onDeath: [{ kind: 'draw', count: 1 }] }),
  card('lock-keeper', 'bound', 'rare', 3, ['Lock-Keeper', "Gardien d'Ecluse"], ['No hull passes until the gate agrees.', "Aucune coque ne passe avant l'accord de la porte."], { attack: 2, health: 5 }, { keywords: ['shield-wall'] }),
  card('frost-gauger', 'bound', 'rare', 4, ['Frost-Gauger', 'Jaugeur de Gel'], ['He measures the cold by what stops moving.', 'Il mesure le froid a ce qui cesse de bouger.'], { attack: 3, health: 4 }, { onPlay: [{ kind: 'freeze', target: 'chosen-enemy-minion' }] }),
  card('pack-ice-breaker', 'bound', 'rare', 5, ['Pack-Ice Breaker', 'Brise-Banquise'], ['Slow work. The ice has all winter.', "Travail lent. La glace a tout l'hiver."], { attack: 5, health: 4 }),
  card('sky-captain-ilse', 'bound', 'epic', 6, ['Sky-Captain Ilse', 'Capitaine Ilse'], ['She flies low and the sea-fog follows.', 'Elle vole bas et la brume la suit.'], { attack: 4, health: 6 }, { onPlay: [{ kind: 'freeze', target: 'all-enemy-minions' }] }),
  card('admiral-corvane', 'bound', 'legendary', 7, ['Admiral Corvane', 'Amiral Corvane'], ['The fleet is gone. The orders are not.', 'La flotte n\'est plus. Les ordres, si.'], { attack: 6, health: 8 }, { keywords: ['shield-wall'], unique: true }),
  card('rimed-boathook', 'iron', 'common', 2, ['Rimed Boathook', 'Gaffe Givree'], ['It has hooked worse than fish.', 'Elle a accroche pire que du poisson.'], { attack: 2 }, { durability: 2 }),
  card('writ-of-embargo', 'writ', 'common', 2, ['Writ of Embargo', "Mandat d'Embargo"], ['No cargo moves. No questions asked.', 'Aucune cargaison ne bouge. Aucune question.'], {}, { effects: [{ kind: 'freeze', target: 'chosen-enemy-minion' }] }),
  card('writ-of-whiteout', 'writ', 'rare', 4, ['Writ of Whiteout', 'Mandat de Voile Blanc'], ['The harbor vanishes. The ledger remains.', 'Le port disparait. Le registre reste.'], {}, { effects: [{ kind: 'freeze', target: 'all-enemy-minions' }, { kind: 'draw', count: 1 }] }),
  card('sea-lock-ledger', 'holding', 'rare', 3, ['Sea-Lock Ledger', "Registre de l'Ecluse"], ['Every lock opened is a debt written.', 'Chaque ecluse ouverte est une dette inscrite.'], {}, { durability: 3, effects: [{ kind: 'freeze', target: 'chosen-enemy-minion' }] }),
  card('harbor-chains', 'snare', 'common', 2, ['Harbor Chains', 'Chaines du Port'], ['Raised when someone leaves in a hurry.', 'Levees quand quelqu\'un part en hate.'], {}, { trigger: 'enemy-attack', effects: [{ kind: 'freeze', target: 'all-enemy-minions' }] })
]

export const BRINE_LOCK_DECK: readonly Id<'card'>[] = BRINE_LOCK_CARDS.filter((entry) => !entry.unique).flatMap((entry) => [entry.id, entry.id])