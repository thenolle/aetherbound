import { describe, expect, test } from 'bun:test'
import { TokenBucket } from './ratelimit'

describe('TokenBucket', () => {
  test('allows a burst and then refuses', () => {
    const bucket = new TokenBucket(3, 1, () => 0)
    expect([bucket.take(), bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, true, false])
  })

  test('refills with time', () => {
    let now = 0
    const bucket = new TokenBucket(2, 1, () => now)
    bucket.take()
    bucket.take()
    expect(bucket.take()).toBe(false)
    now = 1000
    expect(bucket.take()).toBe(true)
    expect(bucket.take()).toBe(false)
  })

  test('never exceeds its capacity', () => {
    let now = 0
    const bucket = new TokenBucket(2, 10, () => now)
    now = 60000
    expect([bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, false])
  })
})