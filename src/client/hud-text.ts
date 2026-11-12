import type { MatchView, ViewEvent } from '../rules/projection'
import type { AttackTarget, Holding, Minion, Oath } from '../rules/types'
import type { CardRegistry } from '../shared/cards'
import { clampIndex, targetList } from './controls'
import type { Selection } from './controls'
import type { Tone } from '../ui/nodes'

export type { Tone }
export type HudLine = Readonly<{ text: string, tone: Tone }>

export type HudInput = Readonly<{
  status: string
  view: MatchView | null
  selection: Selection
  notes: readonly string[]
  registry: CardRegistry
}>

const nameOf = (registry: CardRegistry, id: string): string => registry.get(id)?.name.en ?? id

const targetText = (target: AttackTarget): string => (target.kind === 'hero' ? 'the hero' : `#${target.uid}`)

function minionText(minion: Minion, registry: CardRegistry): string {
  const keywords = minion.keywords.length > 0 ? ` [${minion.keywords.join(',')}]` : ''
  return `#${minion.uid} ${nameOf(registry, minion.cardId)} ${minion.attack}/${minion.health}${keywords}${minion.exhausted ? ` (rest)${minion.frozen === true ? ' (frozen)' : ''}` : ''}${minion.blight === undefined ? '' : ` (blight ${minion.blight})`}${minion.warded === true ? ' (warded)' : ''}`
}

function holdingText(holding: Holding, registry: CardRegistry): string { return `#${holding.uid} ${nameOf(registry, holding.cardId)} x${holding.charges}${holding.used ? ' (used)' : ''}` }
function oathText(oath: Oath, registry: CardRegistry): string { return `#${oath.uid} ${nameOf(registry, oath.cardId)} ${oath.progress}/${oath.goal}` }

export function describeEvent(event: ViewEvent, registry: CardRegistry): string {
  const who = (player: number): string => `P${player}`
  const card = (id: string | null): string => (id === null ? 'a card' : nameOf(registry, id))
  switch (event.type) {
    case 'turn_started': return `${who(event.player)} starts turn ${event.turn} with ${event.aether} Aether`
    case 'turn_timed_out': return `${who(event.player)} ran out of time`
    case 'card_drawn': return `${who(event.player)} draws ${card(event.cardId)}`
    case 'card_burned': return `${who(event.player)} burns ${card(event.cardId)}`
    case 'fatigue': return `${who(event.player)} suffers ${event.damage} fatigue`
    case 'minion_played': return `${who(event.player)} plays ${card(event.cardId)} as #${event.uid}`
    case 'writ_cast': return `${who(event.player)} casts ${card(event.cardId)}`
    case 'iron_equipped': return `${who(event.player)} equips ${card(event.cardId)} ${event.attack}/${event.durability}`
    case 'iron_broken': return `${who(event.player)} iron breaks`
    case 'ability_used': return `${who(event.player)} uses the hero ability`
    case 'holding_placed': return `${who(event.player)} places ${card(event.cardId)} as #${event.uid}`
    case 'holding_activated': return `${who(event.player)} activates holding #${event.uid}`
    case 'holding_destroyed': return `${who(event.player)} loses holding #${event.uid}`
    case 'snare_set': return `${who(event.player)} sets ${event.cardId === null ? 'a snare' : card(event.cardId)}`
    case 'snare_sprung': return `${who(event.player)} springs ${card(event.cardId)}`
    case 'oath_sworn': return `${who(event.player)} swears ${card(event.cardId)} (goal ${event.goal})`
    case 'oath_progress': return `${who(event.player)} oath #${event.uid} progress ${event.progress}`
    case 'oath_fulfilled': return `${who(event.player)} fulfils oath #${event.uid}`
    case 'frozen': return `#${event.uid} is frozen`
    case 'minion_summoned': return `${who(event.player)} summons ${card(event.cardId)} as #${event.uid}`
    case 'blighted': return `#${event.uid} is blighted (${event.stacks})`
    case 'grew': return `#${event.uid} grows to ${event.attack}/${event.health}`
    case 'surged': return `${who(event.player)} vents ${event.amount} Aether`
    case 'attacked': return `${who(event.player)} #${event.attackerUid} attacks ${targetText(event.target)}`
    case 'hero_attacked': return `${who(event.player)} hero attacks ${targetText(event.target)}`
    case 'damaged': return `${event.uid === null ? `${who(event.player)} hero` : `#${event.uid}`} takes ${event.amount}`
    case 'healed': return `${event.uid === null ? `${who(event.player)} hero` : `#${event.uid}`} heals ${event.amount}`
    case 'taxed': return `${who(event.player)} is taxed ${event.amount} Aether next turn`
    case 'minion_died': return `#${event.uid} falls`
    case 'surrendered': return `${who(event.player)} surrenders`
    case 'game_over': return `${who(event.winner)} wins`
    case 'buffed': return `#${event.uid} is reinforced to ${event.attack}/${event.health}`
    case 'forged': return `${who(event.player)} forges the iron to ${event.attack}/${event.durability}`
    case 'card_stolen': return `${who(event.player)} steals ${card(event.cardId)}`
    case 'warded': return `#${event.uid} is warded`
    case 'ward_broken': return `the ward on #${event.uid} shatters`
  }
}

export function buildHud(input: HudInput): HudLine[] {
  const lines: HudLine[] = []
  const add = (text: string, tone: Tone = 'normal'): void => {
    lines.push({ text, tone })
  }

  add('AETHERBOUND: SHATTERED CONCORD', 'accent')
  add(input.status, 'dim')
  const view = input.view
  if (view === null) {
    add('waiting for the Concord Manifold...', 'dim')
    return lines
  }

  const { registry, selection } = input
  const banner =
    view.winner !== null
      ? view.winner === view.viewer ? 'VICTORY' : 'DEFEAT'
      : view.active === view.viewer ? 'YOUR TURN' : 'OPPONENT TURN'
  add(`seat ${view.viewer}   turn ${view.turn}   ${banner}`, view.winner !== null ? 'warn' : 'accent')
  add('')

  const foe = view.opponent
  add('-- opponent --', 'dim')
  add(`hp ${foe.heroHealth}/${foe.heroMaxHealth}  aether ${foe.aether}/${foe.aetherMax}  hand ${foe.handCount}  deck ${foe.deckCount}  tariff ${foe.tariff}  fallen ${foe.fallen}  healed ${foe.healed}`)
  if (foe.weapon !== null) add(`iron: ${nameOf(registry, foe.weapon.cardId)} ${foe.weapon.attack}/${foe.weapon.durability}`)
  add(`board: ${foe.board.map((minion) => minionText(minion, registry)).join('  ') || '(empty)'}`)
  add(`holdings: ${foe.holdings.map((holding) => holdingText(holding, registry)).join('  ') || '(none)'}`)
  add(`snares: ${foe.snareCount}   oaths: ${foe.oaths.map((oath) => oathText(oath, registry)).join('  ') || '(none)'}`)
  add('')

  const me = view.self
  add('-- you --', 'dim')
  add(`hp ${me.heroHealth}/${me.heroMaxHealth}  aether ${me.aether}/${me.aetherMax}  deck ${me.deckCount}  tariff ${me.tariff}  healed ${me.healed}`)
  const iron = me.weapon === null ? 'none' : `${nameOf(registry, me.weapon.cardId)} ${me.weapon.attack}/${me.weapon.durability}`
  add(`iron: ${iron}${me.heroAttacked ? ' (hero attacked)' : ''}   ability: cost ${me.ability.cost}${me.abilityUsed ? ' (used)' : ''}`)

  const selectedMinion = clampIndex(selection.minion, me.board.length)
  add(`board: ${me.board.map((minion, index) => `${index === selectedMinion ? '>' : ' '}${minionText(minion, registry)}`).join('  ') || '(empty)'}`)
  const selectedHolding = clampIndex(selection.holding, me.holdings.length)
  add(`holdings: ${me.holdings.map((holding, index) => `${index === selectedHolding ? '>' : ' '}${holdingText(holding, registry)}`).join('  ') || '(none)'}`)
  add(`snares: ${me.snares.map((snare) => nameOf(registry, snare.cardId)).join('  ') || '(none)'}   oaths: ${me.oaths.map((oath) => oathText(oath, registry)).join('  ') || '(none)'}`)

  const selectedCard = clampIndex(selection.hand, me.hand.length)
  add(`hand: ${me.hand.map((id, index) => `${index === selectedCard ? '>' : ' '}${index + 1}:${nameOf(registry, id)}(${registry.get(id)?.cost ?? '?'})`).join(' ') || '(empty)'}`)

  const targets = targetList(view)
  const selectedTarget = clampIndex(selection.target, targets.length)
  add(`target: ${targets.map((target, index) => `${index === selectedTarget ? '>' : ' '}${targetText(target)}`).join(' ')}`)
  add('')

  add('-- log --', 'dim')
  for (const note of input.notes) add(note)
  add('')
  add('keys: left/right card  p play  m minion  n holding  t target  a attack  h hero attack  k activate  b ability  e end turn  s surrender x2', 'dim')
  return lines
}