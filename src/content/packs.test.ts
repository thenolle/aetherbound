import { describe, expect, test } from 'bun:test'
import { makeCard } from '../rules/test-fixtures'
import { DomainError } from '../shared/errors'
import { Rng } from '../shared/rng'
import { PACK_TABLE, rollPack } from './packs'

const rarities = ['common', 'rare', 'epic', 'legendary'] as const

const pool = Array.from({ length: 16 }, (_, index) => makeCard(index + 1, { rarity: rarities[index % 4] ?? 'common' }))
const rarityOf = (id: string): string => pool.find((card) => card.id === id)?.rarity ?? 'unknown'

describe('rollPack', () => {
  test('is deterministic for a seed and always fills the pack from the pool', () => {
    const a = rollPack(new Rng(5), pool)
    expect(a).toEqual(rollPack(new Rng(5), pool))
    expect(a).toHaveLength(PACK_TABLE.size)
    for (const id of a) expect(pool.some((card) => card.id === id)).toBe(true)
    expect(rollPack(new Rng(6), pool)).not.toEqual(a)
  })

  test('the guaranteed slot is never common', () => {
    const rng = new Rng(11)
    for (let round = 0; round < 2000; round += 1) {
      expect(rarityOf(rollPack(rng, pool)[PACK_TABLE.guaranteedSlot] ?? '')).not.toBe('common')
    }
  })

  test('slot frequencies follow the published weights', () => {
    const rng = new Rng(2026)
    const counts: Record<string, number> = { common: 0, rare: 0, epic: 0, legendary: 0 }
    const rounds = 20000
    for (let round = 0; round < rounds; round += 1) {
      for (const id of rollPack(rng, pool).slice(0, PACK_TABLE.guaranteedSlot)) counts[rarityOf(id)] = (counts[rarityOf(id)] ?? 0) + 1
    }
    const draws = rounds * PACK_TABLE.guaranteedSlot
    const share = (rarity: string): number => ((counts[rarity] ?? 0) / draws) * 100
    expect(Math.abs(share('common') - 70)).toBeLessThan(1.5)
    expect(Math.abs(share('rare') - 22)).toBeLessThan(1.5)
    expect(Math.abs(share('epic') - 6)).toBeLessThan(1)
    expect(Math.abs(share('legendary') - 2)).toBeLessThan(0.7)
  })

  test('a pool that cannot fill a slot is an error', () => {
    expect(() => rollPack(new Rng(1), [makeCard(1)])).toThrow(DomainError)
    expect(() => rollPack(new Rng(1), [])).toThrow(DomainError)
  })
})