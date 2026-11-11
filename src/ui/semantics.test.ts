import { describe, expect, test } from 'bun:test'
import { UiHost } from './host'
import { button, column, input, label, list } from './nodes'

const bounds = { x: 0, y: 0, width: 400, height: 400 }

function make(log: string[] = []) {
  const tree = column([
    label('DECK BUILDER', { size: 24 }),
    label('Cards: 3/30', { size: 14 }),
    label(''),
    input('name', 'Deck name', 'Taxes', { onChange: () => undefined }),
    list('pool', [{ left: '1 Tally-Clerk', right: '2/2' }, { left: '2 Toll-Warden' }], 1, { title: 'Collection', onSelect: () => undefined, onActivate: (index) => log.push(`add ${index}`) }),
    button('save', 'Save', () => log.push('save')),
    button('off', 'Off', () => undefined, false)
  ])
  const host = new UiHost()
  host.setTree(tree, bounds)
  return host
}

describe('semantics', () => {
  test('roles, names and values mirror the screen and empty labels are skipped', () => {
    const items = make().semantics()
    expect(items.map((item) => [item.role, item.name])).toEqual([
      ['heading', 'DECK BUILDER'],
      ['text', 'Cards: 3/30'],
      ['textbox', 'Deck name'],
      ['list', 'Collection'],
      ['button', 'Save'],
      ['button', 'Off']
    ])
    expect(items.find((item) => item.role === 'textbox')?.value).toBe('Taxes')
  })

  test('lists expose their items and selection, buttons their disabled state', () => {
    const items = make().semantics()
    const pool = items.find((item) => item.id === 'pool')
    expect(pool?.items).toEqual(['1 Tally-Clerk, 2/2', '2 Toll-Warden'])
    expect(pool?.selected).toBe(1)
    expect(items.find((item) => item.id === 'off')?.disabled).toBe(true)
    expect(items.find((item) => item.id === 'save')?.disabled).toBe(false)
  })

  test('the focused widget is flagged and can be moved and activated by id', () => {
    const log: string[] = []
    const host = make(log)
    expect(host.semantics().find((item) => item.focused)?.id).toBe('name')
    expect(host.focusById('save')).toBe(true)
    expect(host.semantics().find((item) => item.focused)?.id).toBe('save')
    expect(host.activate('save')).toBe(true)
    expect(host.activate('pool')).toBe(true)
    expect(log).toEqual(['save', 'add 1'])
    expect(host.activate('off')).toBe(false)
    expect(host.focusById('nothing')).toBe(false)
  })
})