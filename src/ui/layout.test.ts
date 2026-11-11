import { describe, expect, test } from 'bun:test'
import { button, column, label, row, spacer } from './nodes'
import { BUTTON_HEIGHT, heightOf, layout } from './layout'

const rectsOf = (placed: ReturnType<typeof layout>) => placed.map((entry) => entry.rect)

describe('layout', () => {
  test('a column stacks its children at their natural heights with gaps and padding', () => {
    const tree = column([label('A', { size: 10 }), button('b', 'B', () => undefined)], { gap: 5, padding: 8 })
    expect(heightOf(tree)).toBe(14 + 5 + BUTTON_HEIGHT + 16)
    const rects = rectsOf(layout(tree, { x: 0, y: 0, width: 100, height: 200 }))
    expect(rects[1]).toEqual({ x: 8, y: 8, width: 84, height: 14 })
    expect(rects[2]).toEqual({ x: 8, y: 27, width: 84, height: BUTTON_HEIGHT })
  })

  test('spacers share the free height by weight', () => {
    const tree = column([spacer(1), label('A', { size: 10 }), spacer(3)])
    const rects = rectsOf(layout(tree, { x: 0, y: 0, width: 50, height: 114 }))
    expect(rects[1]?.height).toBe(25)
    expect(rects[2]).toMatchObject({ y: 25, height: 14 })
    expect(rects[3]).toMatchObject({ y: 39, height: 75 })
  })

  test('a row splits the width equally and gives spacers their weight', () => {
    const plain = rectsOf(layout(row([label('A'), label('B')], { gap: 10 }), { x: 0, y: 0, width: 110, height: 30 }))
    expect(plain[1]?.width).toBe(50)
    expect(plain[2]).toMatchObject({ x: 60, width: 50 })

    const centered = rectsOf(layout(row([spacer(0.5), label('A'), spacer(0.5)]), { x: 0, y: 0, width: 200, height: 30 }))
    expect(centered[2]).toMatchObject({ x: 50, width: 100 })
  })

  test('rows are as tall as their tallest child', () => {
    expect(heightOf(row([label('A', { size: 10 }), button('b', 'B', () => undefined)]))).toBe(BUTTON_HEIGHT)
  })
})