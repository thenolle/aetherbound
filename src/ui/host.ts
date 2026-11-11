import { contains } from './geometry'
import type { Rect } from './geometry'
import { layout } from './layout'
import type { Placed } from './layout'
import type { ButtonNode, UiNode } from './nodes'
import type { Painter, Theme } from './painter'

const BUTTON_TEXT_SIZE = 16

export class UiHost {
  private placed: Placed[] = []
  private bounds: Rect = { x: 0, y: 0, width: 0, height: 0 }
  private focusId: string | null = null

  setTree(root: UiNode, bounds: Rect): void {
    this.bounds = bounds
    this.placed = layout(root, bounds)
    const ids = this.focusable().map((button) => button.id)
    if (this.focusId === null || !ids.includes(this.focusId)) this.focusId = ids[0] ?? null
  }

  focused(): string | null {
    return this.focusId
  }

  key(key: string): boolean {
    const ids = this.focusable().map((button) => button.id)
    if (ids.length === 0) return false
    const index = this.focusId === null ? -1 : ids.indexOf(this.focusId)
    switch (key) {
      case 'ArrowDown':
      case 'ArrowRight':
      case 'Tab':
        this.focusId = ids[(index + 1) % ids.length] ?? null
        return true
      case 'ArrowUp':
      case 'ArrowLeft':
        this.focusId = ids[(Math.max(index, 0) - 1 + ids.length) % ids.length] ?? null
        return true
      case 'Enter':
      case ' ':
        return this.press(this.focusId)
      default:
        return false
    }
  }

  pointer(x: number, y: number, kind: 'down' | 'move'): boolean {
    for (let index = this.placed.length - 1; index >= 0; index -= 1) {
      const entry = this.placed[index]
      if (entry === undefined || entry.node.kind !== 'button' || !entry.node.enabled || !contains(entry.rect, x, y)) continue
      this.focusId = entry.node.id
      if (kind === 'down') entry.node.onPress()
      return true
    }
    return false
  }

  draw(painter: Painter, theme: Theme): void {
    painter.fillRect(this.bounds, theme.background)
    for (const { node, rect } of this.placed) {
      if (node.kind === 'column' || node.kind === 'row') {
        if (node.panel) {
          painter.fillRect(rect, theme.panel)
          painter.strokeRect(rect, theme.border, 1)
        }
      } else if (node.kind === 'label') {
        painter.text(node.text, rect.x, rect.y + (rect.height - node.size) / 2, node.size, theme.tones[node.tone])
      } else if (node.kind === 'button') {
        const focused = node.id === this.focusId
        painter.fillRect(rect, node.enabled ? theme.button : theme.buttonDisabled)
        painter.strokeRect(rect, focused ? theme.focus : theme.border, focused ? 2 : 1)
        const width = painter.measure(node.label, BUTTON_TEXT_SIZE)
        painter.text(
          node.label,
          rect.x + (rect.width - width) / 2,
          rect.y + (rect.height - BUTTON_TEXT_SIZE) / 2,
          BUTTON_TEXT_SIZE,
          node.enabled ? theme.tones.normal : theme.tones.dim
        )
      }
    }
  }

  private focusable(): ButtonNode[] {
    const buttons: ButtonNode[] = []
    for (const { node } of this.placed) {
      if (node.kind === 'button' && node.enabled) buttons.push(node)
    }
    return buttons
  }

  private press(id: string | null): boolean {
    const button = this.focusable().find((entry) => entry.id === id)
    if (button === undefined) return false
    button.onPress()
    return true
  }
}