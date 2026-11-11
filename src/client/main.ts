import { EXCHEQUER_CARDS } from '../content/exchequer'
import type { MatchView } from '../rules/projection'
import { createRegistry } from '../shared/cards'
import { INITIAL_SELECTION, handleKey } from './controls'
import type { Selection } from './controls'
import { HudRenderer } from './hud'
import { buildHud, describeEvent } from './hud-text'
import { GameSocket } from './net'

const registry = createRegistry(EXCHEQUER_CARDS)
const NOTE_LIMIT = 8
const HANDLED_KEYS = new Set(['ArrowLeft', 'ArrowRight'])

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function fieldOf(body: unknown, key: string): unknown {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined
}

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
  const notes: string[] = []
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

  window.addEventListener('resize', render)
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !signedIn) {
      window.location.assign('/auth/google/start')
      return
    }
    if (event.key === 'l' && signedIn) {
      void signOut()
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
  const room = params.get('room') ?? 'dev'
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
  status = `signed in as ${playerName}, joining room ${room}`
  render()

  const joined = await fetch(`/dev/join?room=${encodeURIComponent(room)}`, { method: 'POST' })
  if (!joined.ok) {
    status = joined.status === 409 ? 'this room is full' : `could not join the room (${joined.status})`
    render()
    return
  }
  const body = await readJson(joined)
  const token = fieldOf(body, 'token')
  const seat = fieldOf(body, 'seat')
  if (typeof token !== 'string' || typeof seat !== 'number') {
    status = 'the server sent an unexpected join response'
    render()
    return
  }

  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  socket = new GameSocket(`${scheme}://${window.location.host}/ws?token=${encodeURIComponent(token)}`, {
    onOpen: () => {
      status = `${playerName}: room ${room}, seat ${seat}   (l signs out)`
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

start().catch((error: unknown) => console.error(error))