import { describe, expect, test } from 'bun:test'
import { DomainError } from './errors'
import { Rng } from './rng'

const take = (rng: Rng, count: number): number[] => Array.from({ length: count }, () => rng.nextUint32())

describe('Rng', () => {
  test('same seed gives the same sequence', () => {
    expect(take(new Rng(42), 20)).toEqual(take(new Rng(42), 20))
  })

  test('different seeds diverge', () => {
    expect(take(new Rng(1), 8)).not.toEqual(take(new Rng(2), 8))
  })

  test('state can be captured and resumed', () => {
    const first = new Rng(9)
    take(first, 5)
    const resumed = new Rng(first.getState())
    expect(take(resumed, 5)).toEqual(take(first, 5))
  })

  test('nextInt stays in range and rejects invalid bounds', () => {
    const rng = new Rng(7)
    for (let i = 0; i < 1000; i += 1) {
      const value = rng.nextInt(7)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(7)
    }
    expect(() => rng.nextInt(0)).toThrow(DomainError)
    expect(() => rng.nextInt(1.5)).toThrow(DomainError)
  })

  test('shuffle is a deterministic permutation', () => {
    const items = Array.from({ length: 30 }, (_, index) => index)
    const a = new Rng(3).shuffle(items)
    const b = new Rng(3).shuffle(items)
    expect(a).toEqual(b)
    expect([...a].sort((x, y) => x - y)).toEqual(items)
    expect(a).not.toEqual(items)
  })
})