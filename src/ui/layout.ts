import { inset } from './geometry'
import type { Rect } from './geometry'
import type { StackNode, UiNode } from './nodes'

export type Placed = Readonly<{ node: UiNode, rect: Rect }>

export const BUTTON_HEIGHT = 40
export const ROW_HEIGHT = 24
const LINE_FACTOR = 1.4

const gapsOf = (node: StackNode): number => Math.max(0, node.children.length - 1) * node.gap

export function flexOf(node: UiNode): number {
  if (node.kind === 'spacer' || node.kind === 'list' || node.kind === 'column' || node.kind === 'row') return node.flex
  return 0
}

function weightOf(node: UiNode): number {
  if (node.kind === 'spacer' || node.kind === 'list') return node.flex
  if ((node.kind === 'column' || node.kind === 'row') && node.flex > 0) return node.flex
  return 1
}

export function listTop(selected: number, total: number, rows: number): number {
  if (rows <= 0 || total <= rows) return 0
  return Math.max(0, Math.min(total - rows, selected - Math.floor(rows / 2)))
}

export function heightOf(node: UiNode): number {
  switch (node.kind) {
    case 'label': return Math.ceil(node.size * LINE_FACTOR)
    case 'button': return BUTTON_HEIGHT
    case 'spacer':
    case 'list': return 0
    case 'row': return Math.max(0, ...node.children.map(heightOf)) + node.padding * 2
    case 'column': return node.children.reduce((sum, child) => sum + heightOf(child), 0) + gapsOf(node) + node.padding * 2
  }
}

export function layout(node: UiNode, rect: Rect, out: Placed[] = []): Placed[] {
  out.push({ node, rect })
  if (node.kind === 'column') {
    const inner = inset(rect, node.padding)
    const fixed = node.children.reduce((sum, child) => sum + (flexOf(child) > 0 ? 0 : heightOf(child)), 0) + gapsOf(node)
    const flexTotal = node.children.reduce((sum, child) => sum + flexOf(child), 0)
    const free = Math.max(0, inner.height - fixed)
    let y = inner.y
    for (const child of node.children) {
      const flex = flexOf(child)
      const height = flex > 0 ? (free * flex) / flexTotal : heightOf(child)
      layout(child, { x: inner.x, y, width: inner.width, height }, out)
      y += height + node.gap
    }
  } else if (node.kind === 'row') {
    const inner = inset(rect, node.padding)
    const weights = node.children.map(weightOf)
    const total = weights.reduce((sum, weight) => sum + weight, 0) || 1
    const available = Math.max(0, inner.width - gapsOf(node))
    let x = inner.x
    node.children.forEach((child, index) => {
      const width = (available * (weights[index] ?? 1)) / total
      layout(child, { x, y: inner.y, width, height: inner.height }, out)
      x += width + node.gap
    })
  }
  return out
}