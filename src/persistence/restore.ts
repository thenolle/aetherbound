import type { PlayerSetup, MatchSetup } from '../rules/engine'
import type { MatchView } from '../rules/projection'
import { MatchSession } from '../rules/session'
import type { SequencedViewEvent } from '../rules/session'
import type { PlayerIndex } from '../rules/types'
import type { CardRegistry, HeroDefinition } from '../shared/cards'
import { DomainError } from '../shared/errors'
import { VERSIONS } from '../shared/versions'
import type { SqliteMatchStore, StoredMatch } from './match-store'

export type ContentLookup = Readonly<{
  registry: CardRegistry
  heroes: ReadonlyMap<string, HeroDefinition>
}>

export type ReplayStep = Readonly<{
  index: number
  seq: number
  events: readonly SequencedViewEvent[]
  view: MatchView
}>

function setupFor(stored: StoredMatch, content: ContentLookup): MatchSetup {
  const { header } = stored
  if (header.rulesVersion !== VERSIONS.rules) {
    throw new DomainError('invalid_content', `match ${header.id} used unsupported rules version ${header.rulesVersion}`)
  }
  const side = (index: 0 | 1): PlayerSetup => {
    const hero = content.heroes.get(header.heroes[index])
    if (hero === undefined) throw new DomainError('invalid_content', `unknown hero ${header.heroes[index]}`)
    return { hero, deck: header.decks[index] }
  }
  return { seed: header.seed, registry: content.registry, players: [side(0), side(1)] }
}

export function restoreMatch(store: SqliteMatchStore, matchId: string, content: ContentLookup): MatchSession {
  const stored = store.load(matchId)
  if (stored === null) throw new DomainError('invalid_content', `unknown match ${matchId}`)
  return MatchSession.replayInputs(setupFor(stored, content), stored.entries)
}

export function buildReplay(stored: StoredMatch, content: ContentLookup, viewer: PlayerIndex): ReplayStep[] {
  const session = new MatchSession(setupFor(stored, content))
  const steps: ReplayStep[] = []
  let delivered = 0
  const capture = (index: number): void => {
    const events = session.eventsFor(viewer, delivered)
    const { seq, view } = session.view(viewer)
    steps.push({ index, seq, events, view })
    delivered = seq
  }
  capture(0)
  stored.entries.forEach((input, offset) => {
    const result = input.kind === 'timeout' ? session.timeout() : session.submit(input.actor, input.commandId, input.command)
    if (!result.ok) throw new DomainError('internal', `replay diverged at input ${offset}`)
    capture(offset + 1)
  })
  return steps
}