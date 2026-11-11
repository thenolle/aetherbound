export type Tone = 'normal' | 'dim' | 'accent' | 'warn'
export type LabelNode = Readonly<{ kind: 'label', text: string, tone: Tone, size: number }>
export type ButtonNode = Readonly<{ kind: 'button', id: string, label: string, enabled: boolean, onPress: () => void }>
export type SpacerNode = Readonly<{ kind: 'spacer', flex: number }>
export type ListItem = Readonly<{ left: string, right?: string, tone?: Tone }>
export type ListNode = Readonly<{ kind: 'list', title: string, id: string, items: readonly ListItem[], selected: number, flex: number, onSelect: (index: number) => void, onActivate: (index: number) => void }>
export type StackNode = Readonly<{ kind: 'column' | 'row', children: readonly UiNode[], gap: number, padding: number, panel: boolean, flex: number }>
export type InputNode = Readonly<{ kind: 'input', id: string, title: string, value: string, placeholder: string, maxLength: number, onChange: (value: string) => void, onSubmit: () => void }>
export type UiNode = LabelNode | ButtonNode | SpacerNode | ListNode | InputNode | StackNode
type StackOptions = Partial<Pick<StackNode, 'gap' | 'padding' | 'panel' | 'flex'>>

export const label = (text: string, options: Partial<Pick<LabelNode, 'tone' | 'size'>> = {}): LabelNode => ({ kind: 'label', text, tone: options.tone ?? 'normal', size: options.size ?? 16 })
export const button = (id: string, text: string, onPress: () => void, enabled = true): ButtonNode => ({ kind: 'button', id, label: text, enabled, onPress })
export const spacer = (flex = 1): SpacerNode => ({ kind: 'spacer', flex })
export const list = (id: string, items: readonly ListItem[], selected: number, handlers: Readonly<{ onSelect: (index: number) => void, onActivate: (index: number) => void, title?: string }>, flex = 1): ListNode => ({ kind: 'list', id, title: handlers.title ?? id, items, selected, flex, onSelect: handlers.onSelect, onActivate: handlers.onActivate })
export const input = (id: string, title: string, value: string, handlers: Readonly<{ onChange: (value: string) => void, onSubmit?: () => void, placeholder?: string, maxLength?: number }>): InputNode => ({ kind: 'input', id, title, value, placeholder: handlers.placeholder ?? '', maxLength: handlers.maxLength ?? 32, onChange: handlers.onChange, onSubmit: handlers.onSubmit ?? (() => undefined) })
export const column = (children: readonly UiNode[], options: StackOptions = {}): StackNode => ({ kind: 'column', children, gap: options.gap ?? 0, padding: options.padding ?? 0, panel: options.panel ?? false, flex: options.flex ?? 0 })
export const row = (children: readonly UiNode[], options: StackOptions = {}): StackNode => ({ kind: 'row', children, gap: options.gap ?? 0, padding: options.padding ?? 0, panel: options.panel ?? false, flex: options.flex ?? 0 })
export const centered = (content: UiNode): StackNode => row([spacer(0.5), content, spacer(0.5)])

export function findButton(node: UiNode, id: string): ButtonNode | null {
  if (node.kind === 'button') return node.id === id ? node : null
  if (node.kind === 'column' || node.kind === 'row') {
    for (const child of node.children) {
      const found = findButton(child, id)
      if (found !== null) return found
    }
  }
  return null
}

export function findList(node: UiNode, id: string): ListNode | null {
  if (node.kind === 'list') return node.id === id ? node : null
  if (node.kind === 'column' || node.kind === 'row') {
    for (const child of node.children) {
      const found = findList(child, id)
      if (found !== null) return found
    }
  }
  return null
}

export function findInput(node: UiNode, id: string): InputNode | null {
  if (node.kind === 'input') return node.id === id ? node : null
  if (node.kind === 'column' || node.kind === 'row') {
    for (const child of node.children) {
      const found = findInput(child, id)
      if (found !== null) return found
    }
  }
  return null
}

export function textsOf(node: UiNode): string[] {
  if (node.kind === 'label') return [node.text]
  if (node.kind === 'list') return node.items.map((item) => item.left)
  if (node.kind === 'input') return [node.value]
  if (node.kind === 'column' || node.kind === 'row') return node.children.flatMap(textsOf)
  return []
}