export class TokenBucket {
  private tokens: number
  private last: number
  private readonly capacity: number
  private readonly refillPerSecond: number
  private readonly now: () => number

  constructor(capacity: number, refillPerSecond: number, now: () => number) {
    this.capacity = capacity
    this.refillPerSecond = refillPerSecond
    this.now = now
    this.tokens = capacity
    this.last = now()
  }

  take(): boolean {
    const current = this.now()
    const elapsedSeconds = Math.max(0, current - this.last) / 1000
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond)
    this.last = current
    if (this.tokens < 1) return false
    this.tokens -= 1
    return true
  }
}