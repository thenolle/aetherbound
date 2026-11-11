import type { CardDefinition, HeroDefinition } from '../shared/cards'
import type { Effect } from '../shared/effects'
import { parseId } from '../shared/ids'
import type { Id } from '../shared/ids'
import { defineCard } from './builder'

const THORN_BEAST = parseId('card', 'thorn-beast')

const thorns = (count: number): Effect => ({ kind: 'summon', cardId: THORN_BEAST, attack: 1, health: 1, count })

const card = (...args: DefineArgs): CardDefinition => defineCard('briarthorn', ...args)

type DefineArgs = Parameters<typeof defineCard> extends [unknown, ...infer Rest] ? Rest : never

export const BRIARTHORN_HERO: HeroDefinition = {
  id: parseId('hero', 'hedge-priest-odile-marne'),
  name: { en: 'Odile Marne', fr: 'Odile Marne' },
  title: { en: 'Root-Keeper', fr: 'Gardienne des Racines' },
  faction: 'briarthorn',
  health: 30,
  ability: { name: { en: 'Sow Thorns', fr: 'Semer les Epines' }, cost: 2, effects: [thorns(1)] }
}

export const BRIARTHORN_CARDS: readonly CardDefinition[] = [
  card('thorn-beast', 'bound', 'common', 0, ['Thorn Beast', 'Bete Epineuse'], ['It was a hedge an hour ago.', "C'etait une haie il y a une heure."], { attack: 1, health: 1 }, { token: true }),
  card('bramble-urchin', 'bound', 'common', 1, ['Bramble Urchin', 'Oursin des Ronces'], ['It bites once, and the bite keeps.', 'Il mord une fois, et la morsure reste.'], { attack: 1, health: 1 }, { onDeath: [{ kind: 'blight', amount: 1, target: 'all-enemy-minions' }] }),
  card('carrion-vine', 'bound', 'common', 2, ['Carrion Vine', 'Liane Charognarde'], ['It has never gone hungry in a war.', "Elle n'a jamais eu faim en temps de guerre."], { attack: 1, health: 3 }, { grows: { attack: 1, health: 0 } }),
  card('mire-sprout', 'bound', 'common', 2, ['Mire-Sprout', 'Pousse du Marecage'], ['Plant one and the field remembers.', 'Plantez-en une et le champ se souvient.'], { attack: 1, health: 2 }, { onPlay: [thorns(1)] }),
  card('root-warden', 'bound', 'common', 3, ['Root-Warden', 'Gardien des Racines'], ['The wall was stone. Now it is mostly root.', 'Le mur etait de pierre. Il est surtout racine, a present.'], { attack: 2, health: 5 }, { keywords: ['shield-wall'] }),
  card('blight-reeder', 'bound', 'common', 3, ['Blight-Reeder', 'Joueur de Roseau Pale'], ['A thin tune, and the leaves curl.', 'Un air mince, et les feuilles se recroquevillent.'], { attack: 2, health: 3 }, { onPlay: [{ kind: 'blight', amount: 2, target: 'chosen-enemy-minion' }] }),
  card('thorn-shepherd', 'bound', 'rare', 4, ['Thorn-Shepherd', "Berger d'Epines"], ['He counts them at dusk. The count rises.', 'Il les compte au crepuscule. Le compte augmente.'], { attack: 2, health: 3 }, { onPlay: [thorns(2)] }),
  card('gnarled-hermit', 'bound', 'common', 4, ['Gnarled Hermit', 'Ermite Noueux'], ['He did not die. He seeded.', "Il n'est pas mort. Il a seme."], { attack: 3, health: 5 }, { onDeath: [thorns(2)] }),
  card('bog-bishop', 'bound', 'rare', 4, ['Bog-Bishop', 'Eveque des Tourbieres'], ['The blessing is general. So is the rot.', 'La benediction est generale. La pourriture aussi.'], { attack: 3, health: 4 }, { onPlay: [{ kind: 'blight', amount: 1, target: 'all-enemy-minions' }] }),
  card('strangler-fig', 'bound', 'rare', 5, ['Strangler Fig', 'Figuier Etrangleur'], ['The fortress is still standing, technically.', 'La forteresse tient toujours, techniquement.'], { attack: 4, health: 6 }, { grows: { attack: 1, health: 1 } }),
  card('the-rootmother', 'bound', 'legendary', 8, ['The Rootmother', 'La Mere des Racines'], ['She drinks what the pipes leak.', 'Elle boit ce que les tuyaux laissent fuir.'], { attack: 7, health: 9 }, { unique: true, grows: { attack: 1, health: 1 } }),
  card('billhook', 'iron', 'common', 2, ['Billhook', 'Serpe'], ['For hedges, mostly.', 'Pour les haies, surtout.'], { attack: 2 }, { durability: 2 }),
  card('writ-of-blight', 'writ', 'common', 2, ['Writ of Blight', 'Mandat de Mildiou'], ['Posted on the gate. By morning, the gate was ill.', 'Affiche sur la porte. Au matin, la porte etait malade.'], {}, { effects: [{ kind: 'blight', amount: 3, target: 'chosen-enemy-minion' }] }),
  card('writ-of-overgrowth', 'writ', 'rare', 4, ['Writ of Overgrowth', 'Mandat de Foisonnement'], ['Nobody planted this. Nobody objects.', "Personne n'a plante cela. Personne ne s'y oppose."], {}, { effects: [thorns(2), { kind: 'heal', amount: 3, target: 'own-hero' }] }),
  card('root-cellar', 'holding', 'common', 3, ['Root Cellar', 'Cave a Racines'], ['What is stored there grows.', "Ce qu'on y garde pousse."], {}, { durability: 3, effects: [thorns(1)] }),
  card('hedgerow-trap', 'snare', 'common', 2, ['Hedgerow Trap', 'Piege de Haie'], ['The hedge was here first.', 'La haie etait la avant.'], {}, { trigger: 'enemy-attack', effects: [{ kind: 'blight', amount: 1, target: 'all-enemy-minions' }] }),
  card('oath-of-the-green-choir', 'oath', 'epic', 3, ['Oath of the Green Choir', 'Serment du Choeur Vert'], ['Three hymns, and the roots answer.', 'Trois hymnes, et les racines repondent.'], {}, { goal: 3, effects: [thorns(3), { kind: 'draw', count: 1 }] })
]

export const BRIARTHORN_DECK: readonly Id<'card'>[] = BRIARTHORN_CARDS.filter((entry) => !entry.unique && entry.token !== true).flatMap((entry) => [entry.id, entry.id])