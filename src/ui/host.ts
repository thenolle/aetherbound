import { contains } from './geometry'
import type { Rect } from './geometry'
import { ROW_HEIGHT, layout, listTop } from './layout'
import type { Placed } from './layout'
import type { ButtonNode, ListNode, UiNode } from './nodes'
import type { Painter, Theme } from './painter'

const BUTTON_TEXT_SIZE = 16
const ROW_TEXT_SIZE = 14
const WHEEL_STEP = 3

type Focusable = ButtonNode | ListNode

export class UiHost {
  private placed: Placed[] = []
  private bounds: Rect = { x: 0, y: 0, width: 0, height: 0 }
  private focusId: string | null = null

  setTree(root: UiNode, bounds: Rect): void {
    this.bounds = bounds
    this.placed = layout(root, bounds)
    const ids = this.focusable().map((target) => target.id)
    if (this.focusId === null || !ids.includes(this.focusId)) this.focusId = ids[0] ?? null
  }

  focused(): string | null {
    return this.focusId
  }

  key(key: string): boolean {
    const targets = this.focusable()
    if (targets.length === 0) return false
    const index = this.focusId === null ? -1 : targets.findIndex((target) => target.id === this.focusId)
    const current = index >= 0 ? targets[index] : undefined
    if (current?.kind === 'list' && current.items.length > 0 && this.listKey(current, key)) return true
    switch (key) {
      case 'ArrowDown':
      case 'ArrowRight':
      case 'Tab':
        this.focusId = targets[(index + 1) % targets.length]?.id ?? null
        return true
      case 'ArrowUp':
      case 'ArrowLeft':
        this.focusId = targets[(Math.max(index, 0) - 1 + targets.length) % targets.length]?.id ?? null
        return true
      case 'Enter':
      case ' ':
        if (current?.kind !== 'button') return false
        current.onPress()
        return true
      default:
        return false
    }
  }

  pointer(x: number, y: number, kind: 'down' | 'move'): boolean {
    for (let index = this.placed.length - 1; index >= 0; index -= 1) {
      const entry = this.placed[index]
      if (entry === undefined || !contains(entry.rect, x, y)) continue
      const { node, rect } = entry
      if (node.kind === 'button' && node.enabled) {
        this.focusId = node.id
        if (kind === 'down') node.onPress()
        return true
      }
      if (node.kind === 'list') {
        this.focusId = node.id
        if (kind === 'down') {
          const rows = Math.floor(rect.height / ROW_HEIGHT)
          const row = listTop(node.selected, node.items.length, rows) + Math.floor((y - rect.y) / ROW_HEIGHT)
          if (row >= 0 && row < node.items.length) {
            node.onSelect(row)
            node.onActivate(row)
          }
        }
        return true
      }
    }
    return false
  }

  wheel(x: number, y: number, delta: number): boolean {
    for (let index = this.placed.length - 1; index >= 0; index -= 1) {
      const entry = this.placed[index]
      if (entry === undefined || entry.node.kind !== 'list' || !contains(entry.rect, x, y)) continue
      this.select(entry.node, entry.node.selected + (delta > 0 ? WHEEL_STEP : -WHEEL_STEP))
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
        painter.text(node.label, rect.x + (rect.width - width) / 2, rect.y + (rect.height - BUTTON_TEXT_SIZE) / 2, BUTTON_TEXT_SIZE, node.enabled ? theme.tones.normal : theme.tones.dim)
      } else if (node.kind === 'list') {
        this.drawList(painter, theme, node, rect)
      }
    }
  }

  private drawList(painter: Painter, theme: Theme, node: ListNode, rect: Rect): void {
    const focused = node.id === this.focusId
    painter.fillRect(rect, theme.panel)
    painter.strokeRect(rect, focused ? theme.focus : theme.border, focused ? 2 : 1)
    if (node.items.length === 0) {
      painter.text('(empty)', rect.x + 8, rect.y + 6, ROW_TEXT_SIZE, theme.tones.dim)
      return
    }
    const rows = Math.floor(rect.height / ROW_HEIGHT)
    const top = listTop(node.selected, node.items.length, rows)
    for (let slot = 0; slot < rows; slot += 1) {
      const item = node.items[top + slot]
      if (item === undefined) break
      const rowRect = { x: rect.x + 1, y: rect.y + slot * ROW_HEIGHT, width: rect.width - 2, height: ROW_HEIGHT }
      if (top + slot === node.selected) {
        painter.fillRect(rowRect, theme.button)
        painter.strokeRect(rowRect, focused ? theme.focus : theme.border, 1)
      }
      const color = theme.tones[item.tone ?? 'normal']
      const textY = rowRect.y + (ROW_HEIGHT - ROW_TEXT_SIZE) / 2
      painter.text(item.left, rowRect.x + 8, textY, ROW_TEXT_SIZE, color)
      if (item.right !== undefined) {
        const width = painter.measure(item.right, ROW_TEXT_SIZE)
        painter.text(item.right, rowRect.x + rowRect.width - 8 - width, textY, ROW_TEXT_SIZE, color)
      }
    }
  }

  private listKey(list: ListNode, key: string): boolean {
    switch (key) {
      case 'ArrowDown':
        this.select(list, list.selected + 1)
        return true
      case 'ArrowUp':
        this.select(list, list.selected - 1)
        return true
      case 'Home':
        this.select(list, 0)
        return true
      case 'End':
        this.select(list, list.items.length - 1)
        return true
      case 'Enter':
      case ' ':
        list.onActivate(list.selected)
        return true
      default:
        return false
    }
  }

  private select(list: ListNode, wanted: number): void {
    const next = Math.max(0, Math.min(wanted, list.items.length - 1))
    if (next !== list.selected) list.onSelect(next)
  }

  private focusable(): Focusable[] {
    const targets: Focusable[] = []
    for (const { node } of this.placed) {
      if ((node.kind === 'button' && node.enabled) || node.kind === 'list') targets.push(node)
    }
    return targets
  }
}