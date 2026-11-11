import type { MatchView } from '../rules/projection'
import type { AttackTarget, Command } from '../rules/types'
import type { CardRegistry } from '../shared/cards'
import { needsChosenTarget } from '../shared/effects'
import type { Effect } from '../shared/effects'

export type Selection = Readonly<{ hand: number, minion: number, holding: number, target: number, surrenderArmed: boolean }>

export const INITIAL_SELECTION: Selection = { hand: 0, minion: 0, holding: 0, target: 0, surrenderArmed: false }

export type KeyOutcome = Readonly<{ selection: Selection, command: Command | null, note: string }>

export const targetList = (view: MatchView): readonly AttackTarget[] => [
  { kind: 'hero' },
  ...view.opponent.board.map((minion): AttackTarget => ({ kind: 'minion', uid: minion.uid }))
]

export const clampIndex = (index: number, length: number): number => Math.max(0, Math.min(index, length - 1))

const wrap = (index: number, length: number, step: number): number =>
  length === 0 ? 0 : (clampIndex(index, length) + step + length) % length

const none = (selection: Selection, note = ''): KeyOutcome => ({ selection, command: null, note })

export function handleKey(key: string, view: MatchView, selection: Selection, registry: CardRegistry): KeyOutcome {
  const base: Selection = { ...selection, surrenderArmed: false }
  const targets = targetList(view)
  const live = view.winner === null
  const myTurn = live && view.active === view.viewer
  const target = targets[clampIndex(base.target, targets.length)]

  const issue = (command: Command): KeyOutcome =>
    myTurn ? { selection: base, command, note: '' } : none(base, live ? 'not your turn' : 'the match is over')

  const pickTarget = (effects: readonly Effect[]): { ok: true, extra: { targetUid?: number } } | { ok: false } => {
    if (!needsChosenTarget(effects)) return { ok: true, extra: {} }
    if (target?.kind === 'minion') return { ok: true, extra: { targetUid: target.uid } }
    return { ok: false }
  }

  const playSelected = (): KeyOutcome => {
    const handIndex = clampIndex(base.hand, view.self.hand.length)
    const cardId = view.self.hand[handIndex]
    const card = cardId === undefined ? undefined : registry.get(cardId)
    if (card === undefined) return none(base, 'no card selected')
    switch (card.family) {
      case 'bound': {
        const picked = pickTarget(card.onPlay ?? [])
        if (!picked.ok) return none(base, 'pick an enemy minion with t first')
        return issue({ type: 'play', handIndex, position: view.self.board.length, ...picked.extra })
      }
      case 'writ': {
        const picked = pickTarget(card.effects ?? [])
        if (!picked.ok) return none(base, 'pick an enemy minion with t first')
        return issue({ type: 'cast', handIndex, ...picked.extra })
      }
      case 'iron':
        return issue({ type: 'equip', handIndex })
      case 'holding':
        return issue({ type: 'place', handIndex })
      case 'snare':
        return issue({ type: 'set', handIndex })
      case 'oath':
        return issue({ type: 'swear', handIndex })
      default:
        return none(base, `${card.name.en} cannot be played yet`)
    }
  }

  const activateSelected = (): KeyOutcome => {
    const holding = view.self.holdings[clampIndex(base.holding, view.self.holdings.length)]
    if (holding === undefined) return none(base, 'no holding selected')
    const picked = pickTarget(registry.get(holding.cardId)?.effects ?? [])
    if (!picked.ok) return none(base, 'pick an enemy minion with t first')
    return issue({ type: 'activate', holdingUid: holding.uid, ...picked.extra })
  }

  switch (key) {
    case 'ArrowLeft':
      return none({ ...base, hand: wrap(base.hand, view.self.hand.length, -1) })
    case 'ArrowRight':
      return none({ ...base, hand: wrap(base.hand, view.self.hand.length, 1) })
    case 'm':
      return none({ ...base, minion: wrap(base.minion, view.self.board.length, 1) })
    case 'n':
      return none({ ...base, holding: wrap(base.holding, view.self.holdings.length, 1) })
    case 't':
      return none({ ...base, target: wrap(base.target, targets.length, 1) })
    case 'e':
      return issue({ type: 'end_turn' })
    case 's':
      if (!live) return none(base, 'the match is over')
      if (!selection.surrenderArmed) return none({ ...base, surrenderArmed: true }, 'press s again to surrender')
      return { selection: base, command: { type: 'surrender' }, note: '' }
    case 'p':
      return playSelected()
    case 'k':
      return activateSelected()
    case 'a': {
      const attacker = view.self.board[clampIndex(base.minion, view.self.board.length)]
      if (attacker === undefined) return none(base, 'no minion selected')
      if (target === undefined) return none(base, 'no target selected')
      return issue({ type: 'attack', attackerUid: attacker.uid, target })
    }
    case 'h':
      if (target === undefined) return none(base, 'no target selected')
      return issue({ type: 'hero_attack', target })
    case 'b': {
      const picked = pickTarget(view.self.ability.effects)
      if (!picked.ok) return none(base, 'pick an enemy minion with t first')
      return issue({ type: 'hero_ability', ...picked.extra })
    }
    default:
      return { selection, command: null, note: '' }
  }
}