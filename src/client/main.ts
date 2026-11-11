import { BRINE_LOCK_CARDS } from '../content/brine-lock'
import { EXCHEQUER_CARDS } from '../content/exchequer'
import type { ReplayStep } from '../persistence/restore'
import type { MatchView } from '../rules/projection'
import { createRegistry } from '../shared/cards'
import { button, centered, column, label, spacer } from '../ui/nodes'
import type { UiNode } from '../ui/nodes'
import { DEFAULT_THEME } from '../ui/painter'
import { UiHost } from '../ui/host'
import { CanvasPainter } from './canvas-painter'
import { INITIAL_SELECTION, handleKey } from './controls'
import type { Selection } from './controls'
import { HudRenderer, Presenter } from './hud'
import { buildHud, describeEvent } from './hud-text'
import { fieldOf, textOf } from './json'
import { MenuController } from './menu'
import type { Api } from './menu'
import { GameSocket } from './net'

const registry = createRegistry([...EXCHEQUER_CARDS, ...BRINE_LOCK_CARDS])
const NOTE_LIMIT = 8
const POLL_MS = 1500
const HANDLED_KEYS = new Set(['ArrowLeft', 'ArrowRight'])

type Screen = 'signin' | 'menu' | 'game' | 'replay'

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json() } catch { return null }
}

async function postJson(path: string): Promise<unknown> {
  const response = await fetch(path, { method: 'POST' })
  return response.ok ? readJson(response) : null
}

const api: Api = {
  get: async (path) => {
    const response = await fetch(path)
    return response.ok ? readJson(response) : null
  },
  post: postJson
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function start(): Promise<void> {
  const canvas = document.getElementById('stage')
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing canvas')
  document.body.style.margin = '0'
  document.body.style.background = DEFAULT_THEME.background
  canvas.style.display = 'block'
  const presenter = new Presenter(canvas)
  const hud = new HudRenderer(presenter)
  const painter = new CanvasPainter(presenter.pen)
  const host = new UiHost()
  let screen: Screen = 'signin'
  let menu: MenuController | null = null
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
  const note = (text: string): void => {
    if (text === '') return
    notes.push(text)
    if (notes.length > NOTE_LIMIT) notes.shift()
  }
  const signInTree = (): UiNode => column([
    label('AETHERBOUND: SHATTERED CONCORD', { tone: 'accent', size: 26 }),
    label(status, { tone: 'dim' }),
    button('google', 'Sign in with Google', () => window.location.assign('/auth/google/start')),
    spacer(),
    ...notes.map((line) => label(line, { tone: 'warn' }))
  ], { padding: 28, gap: 12 })
  const render = (): void => {
    if (screen === 'signin' || screen === 'menu') {
      const { width, height } = presenter.frame()
      const tree = screen === 'menu' && menu !== null ? menu.build() : signInTree()
      host.setTree(centered(tree), { x: 0, y: 0, width, height })
      host.draw(painter, DEFAULT_THEME)
      presenter.present()
      return
    }
    hud.draw(buildHud({ status, view, selection, notes, registry }))
  }
  const signOut = async (): Promise<void> => {
    await fetch('/auth/logout', { method: 'POST' })
    window.location.assign('/')
  }
  const showStep = (): void => {
    const step = steps[stepIndex]
    if (step === undefined) return
    view = step.view
    notes = steps.slice(0, stepIndex + 1).flatMap((entry) => entry.events.map((item) => describeEvent(item.event, registry))).slice(-NOTE_LIMIT)
    status = `replay: step ${stepIndex} of ${steps.length - 1} (left/right to step)`
  }
  const loadHistory = async (): Promise<void> => {
    const matches = fieldOf(await api.get('/api/history'), 'matches')
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
  const connect = (token: string, seat: number, playerName: string): void => {
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
  const beginQueue = async (mode: 'casual' | 'ranked', playerName: string): Promise<void> => {
    screen = 'game'
    queueing = true
    notes = []
    status = `${playerName}: searching for a ${mode} opponent (Escape cancels)`
    render()
    let queue: unknown = await postJson(`/api/queue/join${mode === 'ranked' ? '?mode=ranked' : ''}`)
    while (queueing) {
      if (fieldOf(queue, 'status') === 'matched') {
        const token = fieldOf(queue, 'token')
        const seat = fieldOf(queue, 'seat')
        if (typeof token === 'string' && typeof seat === 'number') {
          connect(token, seat, playerName)
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
  window.addEventListener('resize', render)
  canvas.addEventListener('pointerdown', (event) => {
    if ((screen === 'signin' || screen === 'menu') && host.pointer(event.clientX, event.clientY, 'down')) render()
  })
  canvas.addEventListener('pointermove', (event) => {
    if ((screen === 'signin' || screen === 'menu') && host.pointer(event.clientX, event.clientY, 'move')) render()
  })
  window.addEventListener('keydown', (event) => {
    if (screen === 'signin' || screen === 'menu') {
      if (host.key(event.key)) {
        event.preventDefault()
        render()
      }
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
      screen = 'menu'
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
  const params = new URLSearchParams(window.location.search)
  if (params.get('auth') === 'denied') note('google sign-in was cancelled')
  if (params.get('auth') === 'failed') note('google sign-in failed, try again')
  render()
  const me = await fetch('/auth/me')
  if (!me.ok) {
    status = 'Sign in to play.'
    render()
    return
  }
  const playerName = textOf(await readJson(me), 'displayName') ?? 'player'
  signedIn = true
  const replayId = params.get('replay')
  if (replayId !== null) {
    const loaded = fieldOf(await api.get(`/api/replay/${encodeURIComponent(replayId)}`), 'steps')
    if (!Array.isArray(loaded) || loaded.length === 0) {
      screen = 'replay'
      status = 'replay not found'
      render()
      return
    }
    screen = 'replay'
    steps = loaded as ReplayStep[]
    showStep()
    render()
    return
  }
  menu = new MenuController(api, playerName, { play: (mode) => void beginQueue(mode, playerName), signOut: () => void signOut() }, render)
  screen = 'menu'
  render()
  await menu.refresh()
}

start().catch((error: unknown) => console.error(error))