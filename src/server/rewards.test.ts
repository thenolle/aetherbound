import { beforeEach, describe, expect, test } from 'bun:test'
import { REWARD_RULES } from '../content/economy'
import { SqliteAccountStore } from '../persistence/account-store'
import { migrate, openDatabase } from '../persistence/database'
import { EconomyStore } from '../persistence/economy-store'
import { SqliteMatchStore, describeMatch } from '../persistence/match-store'
import { MIGRATIONS } from '../persistence/migrations'
import { fixtureSetup } from '../rules/test-fixtures'
import { makeRewardHook } from './rewards'

let economy: EconomyStore
let matches: SqliteMatchStore
let a: string
let b: string

beforeEach(() => {
  const db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  const accounts = new SqliteAccountStore(db, () => 1000)
  economy = new EconomyStore(db, () => 1000)
  matches = new SqliteMatchStore(db)
  a = accounts.upsertGoogleAccount('a', 'A').id
  b = accounts.upsertGoogleAccount('b', 'B').id
  matches.begin(describeMatch('m1', fixtureSetup(1), 1, [a, b]))
})

const make = () => makeRewardHook(economy, REWARD_RULES, () => Date.UTC(2026, 10, 11))

describe('match reward hook', () => {
  test('a match shorter than the minimum rewards nobody', () => {
    make()({ matchId: 'm1', accounts: [a, b], winner: 0, inputs: REWARD_RULES.minInputs - 1, mode: 'casual' })
    expect(economy.balances(a).packs).toBe(0)
    expect(economy.balances(b).packs).toBe(0)
  })

  test('a real match rewards both players exactly once', () => {
    const reward = make()
    const info = { matchId: 'm1', accounts: [a, b] as const, winner: 1 as const, inputs: REWARD_RULES.minInputs, mode: 'ranked' as const }
    reward(info)
    reward(info)
    expect(economy.balances(a).packs).toBe(1)
    expect(economy.balances(b).packs).toBe(1)
  })

  test('rooms without two known accounts reward nobody and do not fail', () => {
    const reward = make()
    expect(() => reward({ matchId: 'm1', accounts: [a, null], winner: 0, inputs: 50, mode: 'casual' })).not.toThrow()
    expect(() => reward({ matchId: 'm1', accounts: [null, null], winner: 0, inputs: 50, mode: 'casual' })).not.toThrow()
    expect(economy.balances(a).packs).toBe(0)
  })
})