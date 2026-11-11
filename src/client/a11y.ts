import type { Semantic } from '../ui/semantics'

export type A11yActions = Readonly<{
  activate: (id: string) => void
  focus: (id: string) => void
}>

function hide(element: HTMLElement): void {
  element.style.position = 'absolute'
  element.style.width = '1px'
  element.style.height = '1px'
  element.style.overflow = 'hidden'
  element.style.clipPath = 'inset(50%)'
  element.style.whiteSpace = 'nowrap'
}

export class A11yBridge {
  private readonly root: HTMLElement
  private readonly live: HTMLElement
  private readonly actions: A11yActions
  private readonly elements = new Map<string, HTMLElement>()
  private lastFocus: string | null = null

  constructor(actions: A11yActions) {
    this.actions = actions
    this.root = document.createElement('div')
    this.root.setAttribute('role', 'region')
    this.root.setAttribute('aria-label', 'Aetherbound')
    this.live = document.createElement('div')
    this.live.setAttribute('role', 'status')
    this.live.setAttribute('aria-live', 'polite')
    hide(this.root)
    hide(this.live)
    document.body.append(this.root, this.live)
  }

  announce(text: string): void {
    this.live.textContent = text
  }

  update(items: readonly Semantic[]): void {
    const seen = new Set<string>()
    let focusId: string | null = null
    items.forEach((item, position) => {
      seen.add(item.id)
      const element = this.elementFor(item)
      this.apply(element, item)
      if (this.root.children[position] !== element) this.root.insertBefore(element, this.root.children[position] ?? null)
      if (item.focused) {
        focusId = item.id
      }
    })
    for (const [id, element] of this.elements) {
      if (seen.has(id)) continue
      element.remove()
      this.elements.delete(id)
    }
    if (focusId !== null && focusId !== this.lastFocus) {
      const focusTarget = this.elements.get(focusId)
      if (focusTarget !== undefined) focusTarget.focus({ preventScroll: true })
    }
    this.lastFocus = focusId
  }

  private elementFor(item: Semantic): HTMLElement {
    const existing = this.elements.get(item.id)
    if (existing !== undefined) return existing
    const element = document.createElement('div')
    element.tabIndex = -1
    element.addEventListener('click', () => this.actions.activate(item.id))
    element.addEventListener('focus', () => this.actions.focus(item.id))
    this.elements.set(item.id, element)
    return element
  }

  private apply(element: HTMLElement, item: Semantic): void {
    const roles = { heading: 'heading', button: 'button', list: 'listbox', textbox: 'textbox', text: '' } as const
    const role = roles[item.role]
    if (role === '') element.removeAttribute('role')
    else element.setAttribute('role', role)
    if (item.role === 'heading') element.setAttribute('aria-level', '1')
    element.setAttribute('aria-label', item.role === 'text' || item.role === 'heading' ? item.name : item.name)
    element.setAttribute('aria-disabled', String(item.disabled))
    if (item.role === 'text' || item.role === 'heading') {
      element.textContent = item.name
    } else if (item.role === 'textbox') {
      element.textContent = item.value
    } else if (item.role === 'list') {
      element.replaceChildren(...item.items.map((text, index) => {
        const option = document.createElement('div')
        option.setAttribute('role', 'option')
        option.setAttribute('aria-selected', String(index === item.selected))
        option.textContent = text
        return option
      }))
    } else {
      element.textContent = item.name
    }
  }
}