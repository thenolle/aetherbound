import { describe, expect, test } from 'bun:test'
import { UiHost } from './host'
import { BUTTON_HEIGHT } from './layout'
import { button, column, label } from './nodes'
import { DEFAULT_THEME } from './painter'
import { RecordingPainter } from './test-painter'

const bounds = { x: 0, y: 0, width: 200, height: 300 }

function make(pressed: string[], disabled: string[] = []) {
  const tree = column(['a', 'b', 'c'].map((id) => button(id, id.toUpperCase(), () => pressed.push(id), !disabled.includes(id))), { gap: 10 })
  const host = new UiHost()
  host.setTree(tree, bounds)
  return host
}

describe('UiHost', () => {
  test('focus starts on the first enabled button and moves with the arrows, wrapping around', () => {
    const host = make([], ['a'])
    expect(host.focused()).toBe('b')
    host.key('ArrowDown')
    expect(host.focused()).toBe('c')
    host.key('Tab')
    expect(host.focused()).toBe('b')
    host.key('ArrowUp')
    expect(host.focused()).toBe('c')
  })

  test('enter and space press the focused button, other keys are ignored', () => {
    const pressed: string[] = []
    const host = make(pressed)
    expect(host.key('Enter')).toBe(true)
    host.key('ArrowDown')
    expect(host.key(' ')).toBe(true)
    expect(host.key('x')).toBe(false)
    expect(pressed).toEqual(['a', 'b'])
  })

  test('a pointer press activates the button under it and moving only focuses', () => {
    const pressed: string[] = []
    const host = make(pressed)
    const secondY = BUTTON_HEIGHT + 10 + BUTTON_HEIGHT / 2
    expect(host.pointer(50, secondY, 'move')).toBe(true)
    expect(host.focused()).toBe('b')
    expect(pressed).toEqual([])
    expect(host.pointer(50, secondY, 'down')).toBe(true)
    expect(pressed).toEqual(['b'])
    expect(host.pointer(50, 290, 'down')).toBe(false)
  })

  test('disabled buttons can be neither focused nor pressed', () => {
    const pressed: string[] = []
    const host = make(pressed, ['a'])
    expect(host.pointer(50, BUTTON_HEIGHT / 2, 'down')).toBe(false)
    expect(pressed).toEqual([])
  })

  test('focus survives a new tree that keeps the button and resets when it disappears', () => {
    const host = make([])
    host.key('ArrowDown')
    host.setTree(column([button('a', 'A', () => undefined), button('b', 'B', () => undefined)]), bounds)
    expect(host.focused()).toBe('b')
    host.setTree(column([label('nothing to press')]), bounds)
    expect(host.focused()).toBeNull()
    expect(host.key('Enter')).toBe(false)
  })
})

describe('UiHost.draw', () => {
  test('paints the background, labels and buttons with a highlighted focus ring', () => {
    const host = new UiHost()
    host.setTree(column([label('Hello'), button('go', 'Go', () => undefined)], { padding: 10, gap: 4, panel: true }), { x: 0, y: 0, width: 200, height: 200 })
    const painter = new RecordingPainter()
    host.draw(painter, DEFAULT_THEME)
    expect(painter.ops[0]).toBe(`fill 0,0,200,200 ${DEFAULT_THEME.background}`)
    expect(painter.ops.some((op) => op.startsWith(`fill 0,0,200,200 ${DEFAULT_THEME.panel}`))).toBe(true)
    expect(painter.ops.some((op) => op.startsWith('text Hello 10,'))).toBe(true)
    expect(painter.ops.some((op) => op.endsWith(`${DEFAULT_THEME.focus} 2`))).toBe(true)
  })

  test('disabled buttons use the muted fill and text', () => {
    const host = new UiHost()
    host.setTree(column([button('off', 'Off', () => undefined, false)]), { x: 0, y: 0, width: 100, height: 100 })
    const painter = new RecordingPainter()
    host.draw(painter, DEFAULT_THEME)
    expect(painter.ops.some((op) => op.includes(DEFAULT_THEME.buttonDisabled))).toBe(true)
    expect(painter.ops.some((op) => op.startsWith('text Off') && op.endsWith(DEFAULT_THEME.tones.dim))).toBe(true)
    expect(painter.ops.some((op) => op.endsWith(`${DEFAULT_THEME.focus} 2`))).toBe(false)
  })
})