import type { PlayerSetup } from '../rules/engine'
import { MatchSession } from '../rules/session'
import type { CardRegistry, HeroDefinition } from '../shared/cards'
import { DomainError } from '../shared/errors'
import { VERSIONS } from '../shared/versions'
import type { SqliteMatchStore } from './match-store'

export type ContentLookup = Readonly<{
  registry: CardRegistry
  heroes: ReadonlyMap<string, HeroDefinition>
}>

export function restoreMatch(store: SqliteMatchStore, matchId: string, content: ContentLookup): MatchSession {
  const stored = store.load(matchId)
  if (stored === null) throw new DomainError('invalid_content', `unknown match ${matchId}`)
  const { header } = stored
  if (header.rulesVersion !== VERSIONS.rules) {
    throw new DomainError('invalid_content', `match ${matchId} used unsupported rules version ${header.rulesVersion}`)
  }
  const side = (index: 0 | 1): PlayerSetup => {
    const hero = content.heroes.get(header.heroes[index])
    if (hero === undefined) throw new DomainError('invalid_content', `unknown hero ${header.heroes[index]}`)
    return { hero, deck: header.decks[index] }
  }
  return MatchSession.replayInputs({ seed: header.seed, registry: content.registry, players: [side(0), side(1)] }, stored.entries)
}