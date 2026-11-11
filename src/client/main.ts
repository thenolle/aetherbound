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

async function fetchToken(room: string, seat: string): Promise<string | null> {
  const response = await fetch(`/dev/join?room=${encodeURIComponent(room)}&seat=${seat}`)
  if (!response.ok) return null
  const body: unknown = await response.json()
  return typeof body === 'object' && body !== null && 'token' in body && typeof body.token === 'string' ? body.token : null
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
  let status = 'joining the dev room'
  const notes: string[] = []
  let socket: GameSocket | null = null

  const render = (): void => hud.draw(buildHud({ status, view, selection, notes, registry }))
  const note = (text: string): void => {
    if (text === '') return
    notes.push(text)
    if (notes.length > NOTE_LIMIT) notes.shift()
  }

  window.addEventListener('resize', render)
  render()

  const params = new URLSearchParams(window.location.search)
  const room = params.get('room') ?? 'dev'
  const seat = params.get('seat') === '1' ? '1' : '0'
  const token = await fetchToken(room, seat)
  if (token === null) {
    status = 'could not join: the dev endpoint refused the request'
    render()
    return
  }

  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  socket = new GameSocket(`${scheme}://${window.location.host}/ws?token=${encodeURIComponent(token)}`, {
    onOpen: () => {
      status = `connected: room ${room}, seat ${seat}`
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

  window.addEventListener('keydown', (event) => {
    if (view === null || socket === null) return
    const outcome = handleKey(event.key, view, selection, registry)
    selection = outcome.selection
    note(outcome.note)
    if (outcome.command !== null) socket.send(outcome.command)
    if (HANDLED_KEYS.has(event.key)) event.preventDefault()
    render()
  })
}

start().catch((error: unknown) => console.error(error))