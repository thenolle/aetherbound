import { beforeEach, describe, expect, test } from 'bun:test'
import { MatchSession } from '../rules/session'
import { fixtureHero, fixtureRegistry, fixtureSetup } from '../rules/test-fixtures'
import { SqliteAccountStore } from './account-store'
import { migrate, openDatabase } from './database'
import { HistoryService } from './history'
import { SqliteMatchStore, describeMatch } from './match-store'
import { MIGRATIONS } from './migrations'
import { buildReplay, restoreMatch } from './restore'

const content = { registry: fixtureRegistry, heroes: new Map([[fixtureHero.id, fixtureHero]]) }

let db: ReturnType<typeof openDatabase>
let accounts: SqliteAccountStore
let store: SqliteMatchStore
let alice: { id: string }
let bob: { id: string }

function record(id: string, createdAt: number, pair: readonly [string | null, string | null], finish: 'seat-0-wins' | 'seat-1-wins' | 'open'): void {
  const setup = fixtureSetup(createdAt)
  store.begin(describeMatch(id, setup, createdAt, pair))
  const session = new MatchSession(setup)
  session.submit(0, 'a', { type: 'end_turn' })
  if (finish !== 'open') session.submit(finish === 'seat-0-wins' ? 1 : 0, 's', { type: 'surrender' })
  const winner = session.winner
  store.append(id, 0, session.inputsFrom(0), winner === null ? null : { winner, endedAt: createdAt + 100 })
}

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  accounts = new SqliteAccountStore(db, () => 1000)
  store = new SqliteMatchStore(db)
  alice = accounts.upsertGoogleAccount('alice', 'Alice')
  bob = accounts.upsertGoogleAccount('bob', 'Bob')
})

describe('match history', () => {
  test('lists a player matches newest first with seat, opponent and result', () => {
    record('m-old', 1000, [alice.id, bob.id], 'seat-0-wins')
    record('m-new', 2000, [bob.id, alice.id], 'seat-0-wins')
    record('m-open', 3000, [alice.id, bob.id], 'open')

    const list = store.listForAccount(alice.id, 10)
    expect(list.map((entry) => [entry.id, entry.result, entry.seat, entry.opponent])).toEqual([
      ['m-open', 'unfinished', 0, 'Bob'],
      ['m-new', 'loss', 1, 'Bob'],
      ['m-old', 'win', 0, 'Bob']
    ])
    expect(store.listForAccount(alice.id, 2)).toHaveLength(2)
    expect(store.listForAccount(bob.id, 10).map((entry) => entry.result)).toEqual(['unfinished', 'win', 'loss'])
  })

  test('matches are linked to accounts and survive an account deletion', () => {
    record('m-1', 1000, [alice.id, bob.id], 'seat-0-wins')
    expect(store.load('m-1')?.header.accounts).toEqual([alice.id, bob.id])
    expect((db.query('PRAGMA table_info(matches)').all() as { name: string }[]).map((column) => column.name)).toEqual(
      expect.arrayContaining(['account_0', 'account_1'])
    )

    accounts.deleteAccount(bob.id)
    expect(store.load('m-1')?.header.accounts).toEqual([alice.id, null])
    expect(store.listForAccount(alice.id, 10)[0]?.opponent).toBe('Former player')
  })

  test('a replay has one step per input and ends in the restored state', () => {
    record('m-1', 1000, [alice.id, bob.id], 'seat-0-wins')
    const stored = store.load('m-1')
    if (stored === null) throw new Error('missing match')
    const steps = buildReplay(stored, content, 0)
    expect(steps).toHaveLength(stored.entries.length + 1)
    expect(steps.map((step) => step.index)).toEqual([0, 1, 2])
    const seqs = steps.flatMap((step) => step.events.map((item) => item.seq))
    expect(seqs).toEqual(seqs.map((_, index) => index + 1))
    expect(steps.at(-1)?.view).toEqual(restoreMatch(store, 'm-1', content).view(0).view)
    expect(steps.at(-1)?.view.winner).toBe(0)
  })

  test('a replay shows only what the requesting player could see', () => {
    record('m-1', 1000, [alice.id, bob.id], 'open')
    const stored = store.load('m-1')
    if (stored === null) throw new Error('missing match')
    let foeDraws = 0
    for (const step of buildReplay(stored, content, 0)) {
      for (const { event } of step.events) {
        if (event.type === 'card_drawn' && event.player === 1) {
          foeDraws += 1
          expect(event.cardId).toBeNull()
        }
      }
    }
    expect(foeDraws).toBeGreaterThan(0)
  })

  test('the history service scopes lists and replays to participants', () => {
    record('m-1', 1000, [alice.id, bob.id], 'seat-0-wins')
    const carol = accounts.upsertGoogleAccount('carol', 'Carol')
    const service = new HistoryService(store, content)
    expect(service.list(alice.id)).toHaveLength(1)
    expect(service.list(carol.id)).toEqual([])
    expect(service.replay(alice.id, 'm-1')).not.toBeNull()
    expect(service.replay(bob.id, 'm-1')).not.toBeNull()
    expect(service.replay(carol.id, 'm-1')).toBeNull()
    expect(service.replay(alice.id, 'unknown')).toBeNull()
  })
})