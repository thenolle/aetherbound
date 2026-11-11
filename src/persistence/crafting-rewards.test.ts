import { beforeEach, describe, expect, test } from 'bun:test'
import { REWARD_RULES } from '../content/economy'
import { fixtureSetup } from '../rules/test-fixtures'
import { SqliteAccountStore } from './account-store'
import { migrate, openDatabase } from './database'
import { EconomyStore } from './economy-store'
import { SqliteMatchStore, describeMatch } from './match-store'
import { MIGRATIONS } from './migrations'
import { SqliteRatingStore } from './rating-store'

let db: ReturnType<typeof openDatabase>
let accounts: SqliteAccountStore
let economy: EconomyStore
let matches: SqliteMatchStore
let alice: string
let bob: string

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  accounts = new SqliteAccountStore(db, () => 1000)
  economy = new EconomyStore(db, () => 1000)
  matches = new SqliteMatchStore(db)
  alice = accounts.upsertGoogleAccount('alice', 'Alice').id
  bob = accounts.upsertGoogleAccount('bob', 'Bob').id
})

const match = (id: string): void => matches.begin(describeMatch(id, fixtureSetup(1), 1, [alice, bob]))

describe('crafting', () => {
  test('spends dust, adds a copy and writes an audit row', () => {
    expect(economy.grantDust(alice, 'test', 150)).toBe(true)
    expect(economy.grantDust(alice, 'test', 150)).toBe(false)
    expect(economy.craft(alice, 'card-1', 100, 2)).toEqual({ ok: true, copies: 1, dust: 50 })
    expect(economy.collection(alice).get('card-1')).toBe(1)
    expect(db.query('SELECT kind FROM economy_log').all()).toEqual([{ kind: 'craft' }])
  })

  test('refuses without enough dust or beyond the copy limit, changing nothing', () => {
    expect(economy.craft(alice, 'card-1', 100, 2)).toEqual({ ok: false, reason: 'not_enough_dust' })
    economy.grantDust(alice, 'test', 500)
    expect(economy.craft(alice, 'card-1', 100, 1).ok).toBe(true)
    expect(economy.craft(alice, 'card-1', 100, 1)).toEqual({ ok: false, reason: 'at_copy_limit' })
    expect(economy.balances(alice).dust).toBe(400)
    expect((db.query('SELECT COUNT(*) AS n FROM economy_log').get() as { n: number }).n).toBe(1)
  })
})

describe('match rewards', () => {
  test('a player is rewarded once per match', () => {
    match('m1')
    expect(economy.grantMatchReward(alice, 'm1', bob, 'd1', REWARD_RULES)).toBe('granted')
    expect(economy.grantMatchReward(alice, 'm1', bob, 'd1', REWARD_RULES)).toBe('duplicate')
    expect(economy.grantMatchReward(bob, 'm1', alice, 'd1', REWARD_RULES)).toBe('granted')
    expect(economy.balances(alice).packs).toBe(1)
  })

  test('daily and per-opponent caps apply and reset the next day', () => {
    const carol = accounts.upsertGoogleAccount('carol', 'Carol').id
    const dave = accounts.upsertGoogleAccount('dave', 'Dave').id
    for (const id of ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']) match(id)
    expect(economy.grantMatchReward(alice, 'm1', bob, 'd1', REWARD_RULES)).toBe('granted')
    expect(economy.grantMatchReward(alice, 'm2', bob, 'd1', REWARD_RULES)).toBe('granted')
    expect(economy.grantMatchReward(alice, 'm3', bob, 'd1', REWARD_RULES)).toBe('repeat_opponent')
    expect(economy.grantMatchReward(alice, 'm4', carol, 'd1', REWARD_RULES)).toBe('granted')
    expect(economy.grantMatchReward(alice, 'm5', dave, 'd1', REWARD_RULES)).toBe('daily_cap')
    expect(economy.balances(alice).packs).toBe(3)
    expect(economy.grantMatchReward(alice, 'm6', bob, 'd2', REWARD_RULES)).toBe('granted')
    expect(economy.balances(alice).packs).toBe(4)
  })
})

describe('account deletion', () => {
  test('removes the deleted account id from ratings and reward records kept by others', () => {
    match('m1')
    new SqliteRatingStore(db, () => 1000).applyResult('m1', alice, bob)
    economy.grantMatchReward(alice, 'm1', bob, 'd1', REWARD_RULES)
    accounts.deleteAccount(bob)
    expect(db.query('SELECT winner_id, loser_id FROM rating_updates').get()).toEqual({ winner_id: alice, loser_id: 'deleted' })
    expect(db.query('SELECT opponent_id FROM match_rewards WHERE account_id = ?1').get(alice)).toEqual({ opponent_id: 'deleted' })
  })
})