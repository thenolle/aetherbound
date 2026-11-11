import { beforeEach, describe, expect, test } from 'bun:test'
import { SqliteAccountStore } from './account-store'
import { migrate, openDatabase } from './database'
import { MIGRATIONS } from './migrations'
import { SeasonStore } from './season-store'

let db: ReturnType<typeof openDatabase>
let accounts: SqliteAccountStore
let seasons: SeasonStore

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  accounts = new SqliteAccountStore(db, () => 1000)
  seasons = new SeasonStore(db, () => 5000)
})

function rate(sub: string, name: string, mmr: number, games: number): string {
  const id = accounts.upsertGoogleAccount(sub, name).id
  db.run('INSERT INTO ratings (account_id, mmr, games, updated_at) VALUES (?1, ?2, ?3, 0)', [id, mmr, games])
  return id
}

describe('SeasonStore', () => {
  test('the first season is created once', () => {
    expect(seasons.current()).toEqual({ id: 1, name: 'Season 1', startedAt: 5000, endedAt: null })
    expect(seasons.current().id).toBe(1)
    expect((db.query('SELECT COUNT(*) AS n FROM seasons').get() as { n: number }).n).toBe(1)
  })

  test('the leaderboard lists only placed players in rating order without exposing ratings', () => {
    rate('a', 'Alice', 1400, 20)
    rate('b', 'Bob', 1600, 3)
    rate('c', 'Carol', 1500, 10)
    const board = seasons.leaderboard(10)
    expect(board.map((entry) => [entry.position, entry.name])).toEqual([[1, 'Carol'], [2, 'Alice']])
    expect(board[0]).toMatchObject({ league: 'Gold', division: 4 })
    expect(JSON.stringify(board)).not.toContain('mmr')
    expect(seasons.leaderboard(1)).toHaveLength(1)
  })

  test('closing a season archives placed players, softens ratings and starts the next season', () => {
    const alice = rate('a', 'Alice', 1400, 20)
    const bob = rate('b', 'Bob', 1000, 2)
    const result = seasons.closeSeason()
    expect(result.archived).toBe(1)
    expect(result.closed).toMatchObject({ id: 1, endedAt: 5000 })
    expect(result.next).toMatchObject({ id: 2, name: 'Season 2', endedAt: null })

    expect(db.query('SELECT league, division FROM season_results WHERE account_id = ?1').get(alice)).toEqual({ league: 'Bronze', division: 2 })
    expect(db.query('SELECT mmr, games FROM ratings WHERE account_id = ?1').get(alice)).toEqual({ mmr: 1200, games: 3 })
    expect(db.query('SELECT mmr, games FROM ratings WHERE account_id = ?1').get(bob)).toEqual({ mmr: 1000, games: 2 })
    expect(seasons.current().id).toBe(2)
    expect(seasons.leaderboard(10)).toEqual([])
  })
})