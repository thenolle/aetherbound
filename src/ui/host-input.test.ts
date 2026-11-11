import { describe, expect, test } from 'bun:test'
import { UiHost } from './host'
import { button, column, input } from './nodes'
import { DEFAULT_THEME } from './painter'
import { RecordingPainter } from './test-painter'

function make(value = '', maxLength = 5) {
  const log: string[] = []
  const tree = column([
    input('name', 'Deck name', value, { onChange: (next) => log.push(`change ${next}`), onSubmit: () => log.push('submit'), placeholder: 'Name', maxLength }),
    button('b', 'B', () => log.push('button'))
  ], { gap: 8 })
  const host = new UiHost()
  host.setTree(tree, { x: 0, y: 0, width: 300, height: 200 })
  return { host, log }
}

describe('text input', () => {
  test('printable keys are appended up to the limit, backspace removes a whole character', () => {
    const { host, log } = make('abcd')
    host.key('e')
    expect(log).toEqual(['change abcde'])
    const full = make('abcde')
    expect(full.host.key('f')).toBe(true)
    expect(full.log).toEqual([])
    const accented = make('ab\u00e9')
    accented.host.key('Backspace')
    expect(accented.log).toEqual(['change ab'])
    const spaced = make('ab')
    spaced.host.key(' ')
    expect(spaced.log).toEqual(['change ab '])
  })

  test('enter submits, movement keys leave the field and other special keys are ignored', () => {
    const { host, log } = make('ab')
    expect(host.focused()).toBe('name')
    expect(host.key('Escape')).toBe(false)
    expect(host.key('F5')).toBe(false)
    host.key('Enter')
    expect(log).toEqual(['submit'])
    host.key('ArrowDown')
    expect(host.focused()).toBe('b')
    host.key('ArrowUp')
    expect(host.focused()).toBe('name')
  })

  test('a click focuses the field, which shows its placeholder when empty and a caret when focused', () => {
    const { host } = make('')
    host.pointer(250, 100, 'move')
    host.pointer(20, 10, 'down')
    expect(host.focused()).toBe('name')
    const painter = new RecordingPainter()
    host.draw(painter, DEFAULT_THEME)
    expect(painter.ops.some((op) => op.startsWith('text Name') && op.endsWith(DEFAULT_THEME.tones.dim))).toBe(true)
    expect(painter.ops.some((op) => op.startsWith('fill 11,8,2,') && op.endsWith(DEFAULT_THEME.focus))).toBe(true)
  })
})