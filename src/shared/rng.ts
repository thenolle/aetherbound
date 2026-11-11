import { DomainError } from './errors'

const TWO_POW_32 = 4294967296

export class Rng {
  private state: number

  constructor(seed: number) {
    if (!Number.isFinite(seed)) throw new DomainError('invalid_command', 'seed must be a finite number')
    this.state = seed >>> 0
  }

  getState(): number {
    return this.state
  }

  nextUint32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > TWO_POW_32) throw new DomainError('invalid_command', 'maxExclusive must be an integer between 1 and 2^32')
    const limit = TWO_POW_32 - (TWO_POW_32 % maxExclusive)
    let value = this.nextUint32()
    while (value >= limit) value = this.nextUint32()
    return value % maxExclusive
  }

  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items]
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = this.nextInt(i + 1)
      const held = result[i] as T
      result[i] = result[j] as T
      result[j] = held
    }
    return result
  }
}