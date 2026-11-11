import { inset } from './geometry'
import type { Rect } from './geometry'
import type { StackNode, UiNode } from './nodes'

export type Placed = Readonly<{ node: UiNode, rect: Rect }>

export const BUTTON_HEIGHT = 40
const LINE_FACTOR = 1.4

const gapsOf = (node: StackNode): number => Math.max(0, node.children.length - 1) * node.gap

export function heightOf(node: UiNode): number {
  switch (node.kind) {
    case 'label': return Math.ceil(node.size * LINE_FACTOR)
    case 'button': return BUTTON_HEIGHT
    case 'spacer': return 0
    case 'row': return Math.max(0, ...node.children.map(heightOf)) + node.padding * 2
    case 'column': return node.children.reduce((sum, child) => sum + heightOf(child), 0) + gapsOf(node) + node.padding * 2
  }
}

export function layout(node: UiNode, rect: Rect, out: Placed[] = []): Placed[] {
  out.push({ node, rect })
  if (node.kind === 'column') {
    const inner = inset(rect, node.padding)
    const fixed = node.children.reduce((sum, child) => sum + heightOf(child), 0) + gapsOf(node)
    const flexTotal = node.children.reduce((sum, child) => sum + (child.kind === 'spacer' ? child.flex : 0), 0)
    const free = Math.max(0, inner.height - fixed)
    let y = inner.y
    for (const child of node.children) {
      const height = child.kind === 'spacer' ? (flexTotal > 0 ? (free * child.flex) / flexTotal : 0) : heightOf(child)
      layout(child, { x: inner.x, y, width: inner.width, height }, out)
      y += height + node.gap
    }
  } else if (node.kind === 'row') {
    const inner = inset(rect, node.padding)
    const weights = node.children.map((child) => (child.kind === 'spacer' ? child.flex : 1))
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