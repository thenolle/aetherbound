export type Tone = 'normal' | 'dim' | 'accent' | 'warn'
export type LabelNode = Readonly<{ kind: 'label', text: string, tone: Tone, size: number }>
export type ButtonNode = Readonly<{ kind: 'button', id: string, label: string, enabled: boolean, onPress: () => void }>
export type SpacerNode = Readonly<{ kind: 'spacer', flex: number }>
export type StackNode = Readonly<{ kind: 'column' | 'row', children: readonly UiNode[], gap: number, padding: number, panel: boolean }>
export type UiNode = LabelNode | ButtonNode | SpacerNode | StackNode

type StackOptions = Partial<Pick<StackNode, 'gap' | 'padding' | 'panel'>>

export const label = (text: string, options: Partial<Pick<LabelNode, 'tone' | 'size'>> = {}): LabelNode => ({ kind: 'label', text, tone: options.tone ?? 'normal', size: options.size ?? 16 })
export const button = (id: string, text: string, onPress: () => void, enabled = true): ButtonNode => ({ kind: 'button', id, label: text, enabled, onPress })
export const spacer = (flex = 1): SpacerNode => ({ kind: 'spacer', flex })
export const column = (children: readonly UiNode[], options: StackOptions = {}): StackNode => ({ kind: 'column', children, gap: options.gap ?? 0, padding: options.padding ?? 0, panel: options.panel ?? false })
export const row = (children: readonly UiNode[], options: StackOptions = {}): StackNode => ({ kind: 'row', children, gap: options.gap ?? 0, padding: options.padding ?? 0, panel: options.panel ?? false })
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

export function textsOf(node: UiNode): string[] {
  if (node.kind === 'label') return [node.text]
  if (node.kind === 'column' || node.kind === 'row') return node.children.flatMap(textsOf)
  return []
}