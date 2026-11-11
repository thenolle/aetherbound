import { encodeCommandFrame } from '../protocol/commands'
import { ProtocolError } from '../protocol/errors'
import { decodeServerFrame } from '../protocol/server'
import type { ServerMessage } from '../protocol/server'
import type { Command } from '../rules/types'

export type GameSocketHandlers = Readonly<{
  onOpen: () => void
  onMessage: (message: ServerMessage) => void
  onClose: (reason: string) => void
}>

export class GameSocket {
  private readonly socket: WebSocket
  private readonly nonce = Math.random().toString(36).slice(2, 8)
  private sequence = 0
  private counter = 0

  constructor(url: string, handlers: GameSocketHandlers) {
    this.socket = new WebSocket(url)
    this.socket.binaryType = 'arraybuffer'
    this.socket.addEventListener('open', () => handlers.onOpen())
    this.socket.addEventListener('message', (event) => {
      if (!(event.data instanceof ArrayBuffer)) {
        this.socket.close(1003, 'binary frames only')
        return
      }
      let message: ServerMessage
      try {
        message = decodeServerFrame(new Uint8Array(event.data)).message
      } catch (error) {
        if (error instanceof ProtocolError) {
          this.socket.close(4400, 'malformed frame')
          return
        }
        throw error
      }
      handlers.onMessage(message)
    })
    this.socket.addEventListener('close', (event) => handlers.onClose(event.reason || `code ${event.code}`))
  }

  send(command: Command): void {
    if (this.socket.readyState !== WebSocket.OPEN) return
    this.counter += 1
    const frame = new Uint8Array(encodeCommandFrame(this.sequence, `${this.nonce}-${this.counter}`, command))
    this.socket.send(frame)
    this.sequence += 1
  }
}