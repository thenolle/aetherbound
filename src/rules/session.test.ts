import { describe, expect, test } from 'bun:test'
import { DomainError } from '../shared/errors'
import { MatchSession } from './session'
import { fixtureSetup } from './test-fixtures'
import type { Command, PlayerIndex } from './types'

const endTurn: Command = { type: 'end_turn' }
const fresh = () => new MatchSession(fixtureSetup(1))

describe('MatchSession', () => {
  test('numbers creation events contiguously from one', () => {
    const session = fresh()
    const seqs = session.eventsFor(0, 0).map((item) => item.seq)
    expect(seqs.length).toBeGreaterThan(0)
    expect(seqs).toEqual(seqs.map((_, index) => index + 1))
    expect(session.lastSeq).toBe(seqs.length)
  })

  test('applies a command once and ignores a retry of the same id', () => {
    const session = fresh()
    const first = session.submit(0, 'c1', endTurn)
    expect(first).toMatchObject({ ok: true, duplicate: false })
    const seq = session.lastSeq
    const retry = session.submit(0, 'c1', endTurn)
    expect(retry).toEqual({ ok: true, duplicate: true, lastSeq: seq })
    expect(session.lastSeq).toBe(seq)
    expect(session.inspect().active).toBe(1)
  })

  test('a rejected command changes nothing', () => {
    const session = fresh()
    const seq = session.lastSeq
    const before = session.inspect()
    expect(session.submit(1, 'x1', endTurn)).toMatchObject({ ok: false, code: 'not_your_turn' })
    expect(session.lastSeq).toBe(seq)
    expect(session.inspect()).toEqual(before)
  })

  test('rejects malformed command ids and seats', () => {
    const session = fresh()
    expect(session.submit(0, 'bad id!', endTurn)).toMatchObject({ ok: false, code: 'invalid_command' })
    expect(session.submit(0, '', endTurn)).toMatchObject({ ok: false, code: 'invalid_command' })
    expect(session.submit(2 as unknown as PlayerIndex, 'c2', endTurn)).toMatchObject({ ok: false, code: 'invalid_command' })
  })

  test('event streams hide the opponent draws and honour afterSeq', () => {
    const session = fresh()
    let opponentDraws = 0
    let ownDraws = 0
    for (const { event } of session.eventsFor(0, 0)) {
      if (event.type !== 'card_drawn') continue
      if (event.player === 1) {
        opponentDraws += 1
        expect(event.cardId).toBeNull()
      } else {
        ownDraws += 1
        expect(event.cardId).not.toBeNull()
      }
    }
    expect(opponentDraws).toBeGreaterThan(0)
    expect(ownDraws).toBeGreaterThan(0)
    expect(session.eventsFor(0, session.lastSeq)).toEqual([])
    expect(() => session.eventsFor(0, -1)).toThrow(DomainError)
    expect(() => session.eventsFor(0, 1.5)).toThrow(DomainError)
  })

  test('views carry the sequence and no engine internals', () => {
    const session = fresh()
    const { seq, view } = session.view(0)
    expect(seq).toBe(session.lastSeq)
    expect(JSON.stringify(view)).not.toContain('rngState')
    expect(view.viewer).toBe(0)
  })

  test('timeout passes the turn and is rejected after the match ends', () => {
    const session = fresh()
    expect(session.timeout()).toMatchObject({ ok: true })
    expect(session.inspect().active).toBe(1)
    session.submit(0, 'bye', { type: 'surrender' })
    expect(session.winner).toBe(1)
    expect(session.timeout()).toMatchObject({ ok: false, code: 'invalid_command' })
  })

  test('replaying the log reproduces the state and the log', () => {
    const live = fresh()
    live.submit(0, 'a', endTurn)
    live.submit(1, 'b', endTurn)
    live.timeout()
    live.submit(1, 'd', endTurn)
    live.submit(0, 'e', { type: 'surrender' })
    const replayed = MatchSession.replay(fixtureSetup(1), live.getLog())
    expect(replayed.inspect()).toEqual(live.inspect())
    expect(replayed.getLog()).toEqual(live.getLog())
    expect(replayed.lastSeq).toBe(live.lastSeq)
  })
})