import { describe, expect, test } from 'bun:test'
import { UiHost } from './host'
import { BUTTON_HEIGHT, layout, listTop } from './layout'
import { button, column, label, list, row } from './nodes'
import { DEFAULT_THEME } from './painter'
import { RecordingPainter } from './test-painter'

const items = Array.from({ length: 10 }, (_, index) => ({ left: `Item ${index}`, right: `x${index}` }))

function make(selected = 0, height = 240) {
  const log: string[] = []
  const tree = row([
    list('l', items, selected, { onSelect: (index) => log.push(`select ${index}`), onActivate: (index) => log.push(`activate ${index}`) }),
    button('b', 'B', () => log.push('button'))
  ], { flex: 1 })
  const host = new UiHost()
  host.setTree(tree, { x: 0, y: 0, width: 400, height })
  return { host, log }
}

describe('lists', () => {
  test('arrows move the selection inside a focused list and left/right leave it', () => {
    const { host, log } = make()
    expect(host.focused()).toBe('l')
    expect(host.key('ArrowDown')).toBe(true)
    expect(host.key('ArrowUp')).toBe(true)
    expect(host.key('Enter')).toBe(true)
    expect(log).toEqual(['select 1', 'activate 0'])
    expect(host.key('ArrowRight')).toBe(true)
    expect(host.focused()).toBe('b')
    host.key('Enter')
    expect(log.at(-1)).toBe('button')
  })

  test('clicking a row selects and activates it, hovering only focuses, and the wheel scrolls', () => {
    const { host, log } = make()
    host.pointer(300, 10, 'move')
    host.pointer(50, 24 * 3 + 5, 'move')
    expect(log).toEqual([])
    expect(host.pointer(50, 24 * 3 + 5, 'down')).toBe(true)
    expect(log).toEqual(['select 3', 'activate 3'])
    expect(host.wheel(50, 50, 1)).toBe(true)
    expect(log.at(-1)).toBe('select 3')
    expect(host.wheel(300, 50, 1)).toBe(false)
  })

  test('the visible window follows the selection and the selected row is highlighted', () => {
    expect([listTop(0, 10, 4), listTop(5, 10, 4), listTop(9, 10, 4), listTop(1, 3, 4)]).toEqual([0, 3, 6, 0])
    const { host } = make(9, 72)
    const painter = new RecordingPainter()
    host.draw(painter, DEFAULT_THEME)
    expect(painter.ops.some((op) => op.startsWith('text Item 9'))).toBe(true)
    expect(painter.ops.some((op) => op.startsWith('text x9'))).toBe(true)
    expect(painter.ops.some((op) => op.startsWith('text Item 0'))).toBe(false)
    expect(painter.ops.some((op) => op.endsWith(`${DEFAULT_THEME.focus} 1`))).toBe(true)
  })

  test('a flexible stack takes the height the fixed children leave over', () => {
    const tree = column([label('Title'), row([list('l', items, 0, { onSelect: () => undefined, onActivate: () => undefined })], { flex: 1 }), button('b', 'B', () => undefined)], { gap: 10 })
    const placed = layout(tree, { x: 0, y: 0, width: 300, height: 300 })
    expect(placed[2]?.rect.height).toBe(300 - 23 - BUTTON_HEIGHT - 20)
    expect(placed[3]?.rect.height).toBe(300 - 23 - BUTTON_HEIGHT - 20)
  })
})