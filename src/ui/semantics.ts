import type { Placed } from './layout'

export type SemanticRole = 'heading' | 'text' | 'button' | 'list' | 'textbox'
export type Semantic = Readonly<{ id: string, role: SemanticRole, name: string, disabled: boolean, focused: boolean, value: string, items: readonly string[], selected: number }>

const base = { disabled: false, focused: false, value: '', items: [] as readonly string[], selected: -1 }

export function describeSemantics(placed: readonly Placed[], focusId: string | null): Semantic[] {
  const found: Semantic[] = []
  placed.forEach(({ node }, index) => {
    switch (node.kind) {
      case 'label':
        found.push({ ...base, id: `label-${index}`, role: node.size >= 22 ? 'heading' : 'text', name: node.text })
        break
      case 'button':
        found.push({ ...base, id: node.id, role: 'button', name: node.label, disabled: !node.enabled, focused: node.id === focusId })
        break
      case 'list':
        found.push({ ...base, id: node.id, role: 'list', name: node.title, focused: node.id === focusId, items: node.items.map((item) => (item.right === undefined ? item.left : `${item.left}, ${item.right}`)), selected: node.selected })
        break
      case 'input':
        found.push({ ...base, id: node.id, role: 'textbox', name: node.title, focused: node.id === focusId, value: node.value })
        break
    }
  })
  return found.filter((item) => item.name !== '' || item.role === 'textbox')
}