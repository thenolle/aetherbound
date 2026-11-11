import type { CardRegistry } from '../shared/cards'
import { DomainError } from '../shared/errors'
import type { ErrorCode } from '../shared/errors'
import { applyCommand, createMatch, timeoutTurn } from './engine'
import type { MatchSetup, StepResult } from './engine'
import { projectEvent, projectState } from './projection'
import type { MatchView, ViewEvent } from './projection'
import type { Command, GameEvent, MatchState, PlayerIndex } from './types'

export type SequencedEvent = Readonly<{ seq: number, event: GameEvent }>

export type SequencedViewEvent = Readonly<{ seq: number, event: ViewEvent }>

export type LogEntry =
  | Readonly<{ kind: 'start', events: readonly SequencedEvent[] }>
  | Readonly<{ kind: 'timeout', events: readonly SequencedEvent[] }>
  | Readonly<{ kind: 'command', actor: PlayerIndex, commandId: string, command: Command, events: readonly SequencedEvent[] }>

export type InputEntry =
  | Readonly<{ kind: 'timeout' }>
  | Readonly<{ kind: 'command', actor: PlayerIndex, commandId: string, command: Command }>

export type SubmitResult =
  | Readonly<{ ok: true, duplicate: boolean, lastSeq: number }>
  | Readonly<{ ok: false, code: ErrorCode, message: string }>

export type SessionView = Readonly<{ seq: number, view: MatchView }>

const COMMAND_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const REMEMBERED_COMMANDS = 256

export class MatchSession {
  private state: MatchState
  private seq = 0
  private readonly registry: CardRegistry
  private readonly log: LogEntry[] = []
  private readonly inputs: InputEntry[] = []
  private readonly seen: [Map<string, number>, Map<string, number>] = [new Map(), new Map()]

  constructor(setup: MatchSetup) {
    const created = createMatch(setup)
    this.registry = setup.registry
    this.state = created.state
    this.log.push({ kind: 'start', events: this.sequence(created.events) })
  }

  static replay(setup: MatchSetup, entries: readonly LogEntry[]): MatchSession {
    const inputs = entries.flatMap((entry): InputEntry[] => {
      if (entry.kind === 'start') return []
      if (entry.kind === 'timeout') return [{ kind: 'timeout' }]
      return [{ kind: 'command', actor: entry.actor, commandId: entry.commandId, command: entry.command }]
    })
    return MatchSession.replayInputs(setup, inputs)
  }

  static replayInputs(setup: MatchSetup, inputs: readonly InputEntry[]): MatchSession {
    const session = new MatchSession(setup)
    for (const input of inputs) {
      const result = input.kind === 'timeout' ? session.timeout() : session.submit(input.actor, input.commandId, input.command)
      if (!result.ok) throw new DomainError('internal', `replay diverged: ${result.message}`)
    }
    return session
  }

  get lastSeq(): number {
    return this.seq
  }

  get winner(): PlayerIndex | null {
    return this.state.winner
  }

  get inputCount(): number {
    return this.inputs.length
  }

  inputsFrom(start: number): readonly InputEntry[] {
    return this.inputs.slice(start)
  }

  inspect(): MatchState {
    return structuredClone(this.state)
  }

  getLog(): readonly LogEntry[] {
    return structuredClone(this.log)
  }

  view(viewer: PlayerIndex): SessionView {
    return { seq: this.seq, view: projectState(this.state, viewer) }
  }

  eventsFor(viewer: PlayerIndex, afterSeq: number): SequencedViewEvent[] {
    if (!Number.isInteger(afterSeq) || afterSeq < 0) {
      throw new DomainError('invalid_command', 'afterSeq must be a non-negative integer')
    }
    const visible: SequencedViewEvent[] = []
    for (const entry of this.log) {
      for (const item of entry.events) {
        if (item.seq > afterSeq) visible.push({ seq: item.seq, event: projectEvent(item.event, viewer) })
      }
    }
    return visible
  }

  submit(actor: PlayerIndex, commandId: string, command: Command): SubmitResult {
    if (actor !== 0 && actor !== 1) return this.rejected('invalid_command', 'invalid seat')
    if (!COMMAND_ID_PATTERN.test(commandId)) return this.rejected('invalid_command', 'invalid command id')
    const remembered = this.seen[actor].get(commandId)
    if (remembered !== undefined) return { ok: true, duplicate: true, lastSeq: remembered }

    const result = this.attempt(
      () => applyCommand(this.state, actor, command, this.registry),
      (events) => ({ kind: 'command', actor, commandId, command: structuredClone(command), events })
    )
    if (result.ok) this.remember(actor, commandId, result.lastSeq)
    return result
  }

  timeout(): SubmitResult {
    return this.attempt(() => timeoutTurn(this.state), (events) => ({ kind: 'timeout', events }))
  }

  private attempt(run: () => StepResult, describe: (events: readonly SequencedEvent[]) => LogEntry): SubmitResult {
    try {
      const result = run()
      this.state = result.state
      const entry = describe(this.sequence(result.events))
      this.log.push(entry)
      if (entry.kind === 'command') {
        this.inputs.push({ kind: 'command', actor: entry.actor, commandId: entry.commandId, command: entry.command })
      } else if (entry.kind === 'timeout') {
        this.inputs.push({ kind: 'timeout' })
      }
      return { ok: true, duplicate: false, lastSeq: this.seq }
    } catch (error) {
      if (error instanceof DomainError) {
        return this.rejected(error.code, error.code === 'internal' ? 'internal error' : error.message)
      }
      throw error
    }
  }

  private rejected(code: ErrorCode, message: string): SubmitResult {
    return { ok: false, code, message }
  }

  private sequence(events: readonly GameEvent[]): SequencedEvent[] {
    return events.map((event) => {
      this.seq += 1
      return { seq: this.seq, event }
    })
  }

  private remember(actor: PlayerIndex, commandId: string, lastSeq: number): void {
    const memory = this.seen[actor]
    memory.set(commandId, lastSeq)
    if (memory.size > REMEMBERED_COMMANDS) {
      const oldest = memory.keys().next()
      if (!oldest.done) memory.delete(oldest.value)
    }
  }
}