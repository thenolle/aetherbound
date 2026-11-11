import { EXCHEQUER_CARDS } from '../content/exchequer'
import type { ReplayStep } from '../persistence/restore'
import type { MatchView } from '../rules/projection'
import { createRegistry } from '../shared/cards'
import { INITIAL_SELECTION, handleKey } from './controls'
import type { Selection } from './controls'
import { HudRenderer } from './hud'
import { buildHud, describeEvent } from './hud-text'
import { GameSocket } from './net'

const registry = createRegistry(EXCHEQUER_CARDS)
const NOTE_LIMIT = 8
const POLL_MS = 1500
const HANDLED_KEYS = new Set(['ArrowLeft', 'ArrowRight'])

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json() } catch { return null }
}

async function postJson(path: string): Promise<unknown> {
  const response = await fetch(path, { method: 'POST' })
  return response.ok ? readJson(response) : null
}

function fieldOf(body: unknown, key: string): unknown {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function start(): Promise<void> {
  const canvas = document.getElementById('stage')
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing canvas')
  document.body.style.margin = '0'
  document.body.style.background = '#14161a'
  canvas.style.display = 'block'
  const hud = new HudRenderer(canvas)
  let view: MatchView | null = null
  let selection: Selection = INITIAL_SELECTION
  let status = 'checking your session'
  let signedIn = false
  let queueing = false
  let steps: readonly ReplayStep[] = []
  let stepIndex = 0
  let historyIds: string[] = []
  let notes: string[] = []
  let socket: GameSocket | null = null
  const render = (): void => hud.draw(buildHud({ status, view, selection, notes, registry }))
  const note = (text: string): void => {
    if (text === '') return
    notes.push(text)
    if (notes.length > NOTE_LIMIT) notes.shift()
  }
  const signOut = async (): Promise<void> => {
    await fetch('/auth/logout', { method: 'POST' })
    window.location.assign('/')
  }
  const showStep = (): void => {
    const step = steps[stepIndex]
    if (step === undefined) return
    view = step.view
    notes = steps
      .slice(0, stepIndex + 1)
      .flatMap((entry) => entry.events.map((item) => describeEvent(item.event, registry)))
      .slice(-NOTE_LIMIT)
    status = `replay: step ${stepIndex} of ${steps.length - 1} (left/right to step)`
  }
  const loadHistory = async (): Promise<void> => {
    const response = await fetch('/api/history')
    if (!response.ok) return
    const matches = fieldOf(await readJson(response), 'matches')
    if (!Array.isArray(matches)) return
    historyIds = []
    note('-- recent matches (press 1-5 to replay) --')
    matches.slice(0, 5).forEach((match: unknown) => {
      const id = fieldOf(match, 'id')
      if (typeof id !== 'string') return
      historyIds.push(id)
      note(`${historyIds.length}: ${String(fieldOf(match, 'result'))} vs ${String(fieldOf(match, 'opponent'))}`)
    })
    render()
  }
  window.addEventListener('resize', render)
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !signedIn) {
      window.location.assign('/auth/google/start')
      return
    }
    if (!signedIn) return
    if (event.key === 'l') {
      void signOut()
      return
    }
    if (event.key === 'Escape' && queueing) {
      queueing = false
      void fetch('/api/queue/leave', { method: 'POST' })
      status = 'left the queue: reload to search again'
      render()
      return
    }
    if (event.key === 'y') {
      void loadHistory()
      return
    }
    const picked = Number(event.key)
    if (Number.isInteger(picked) && picked >= 1 && picked <= historyIds.length) {
      window.location.assign(`/?replay=${historyIds[picked - 1]}`)
      return
    }
    if (steps.length > 0) {
      if (event.key === 'ArrowRight') stepIndex = Math.min(stepIndex + 1, steps.length - 1)
      if (event.key === 'ArrowLeft') stepIndex = Math.max(stepIndex - 1, 0)
      showStep()
      event.preventDefault()
      render()
      return
    }
    if (view === null || socket === null) return
    const outcome = handleKey(event.key, view, selection, registry)
    selection = outcome.selection
    note(outcome.note)
    if (outcome.command !== null) socket.send(outcome.command)
    if (HANDLED_KEYS.has(event.key)) event.preventDefault()
    render()
  })
  render()
  const params = new URLSearchParams(window.location.search)
  if (params.get('auth') === 'denied') note('google sign-in was cancelled')
  if (params.get('auth') === 'failed') note('google sign-in failed, try again')
  const me = await fetch('/auth/me')
  if (!me.ok) {
    status = 'not signed in: press Enter to sign in with Google'
    render()
    return
  }
  const name = fieldOf(await readJson(me), 'displayName')
  const playerName = typeof name === 'string' ? name : 'player'
  signedIn = true
  const replayId = params.get('replay')
  if (replayId !== null) {
    const response = await fetch(`/api/replay/${encodeURIComponent(replayId)}`)
    const loaded = response.ok ? fieldOf(await readJson(response), 'steps') : null
    if (!Array.isArray(loaded) || loaded.length === 0) {
      status = 'replay not found'
      render()
      return
    }
    steps = loaded as ReplayStep[]
    showStep()
    render()
    return
  }
  const connect = (token: string, seat: number): void => {
    queueing = false
    status = `${playerName}: seat ${seat}   (l signs out, y history)`
    render()
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
    socket = new GameSocket(`${scheme}://${window.location.host}/ws?token=${encodeURIComponent(token)}`, {
      onOpen: () => {
        status = `${playerName}: connected, seat ${seat}   (l signs out, y history)`
        render()
      },
      onMessage: (message) => {
        switch (message.type) {
          case 'snapshot':
            view = message.view
            break
          case 'events':
            for (const item of message.events) note(describeEvent(item.event, registry))
            break
          case 'accepted':
            break
          case 'rejected':
            note(`rejected: ${message.code} (${message.message})`)
            break
        }
        render()
      },
      onClose: (reason) => {
        status = `disconnected: ${reason}`
        render()
      }
    })
  }
  queueing = true
  status = `signed in as ${playerName}: searching for an opponent (Escape cancels)`
  render()
  const mode = params.get('mode') === 'ranked' ? '?mode=ranked' : ''
  let queue: unknown = await postJson(`/api/queue/join${mode}`)
  while (queueing) {
    if (fieldOf(queue, 'status') === 'matched') {
      const token = fieldOf(queue, 'token')
      const seat = fieldOf(queue, 'seat')
      if (typeof token === 'string' && typeof seat === 'number') {
        connect(token, seat)
        return
      }
    }
    await sleep(POLL_MS)
    if (!queueing) return
    const polled = await fetch('/api/queue/status')
    if (!polled.ok) {
      status = `queue error (${polled.status})`
      render()
      return
    }
    queue = await readJson(polled)
  }
}

start().catch((error: unknown) => console.error(error))