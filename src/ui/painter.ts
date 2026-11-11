import type { Rect } from './geometry'
import type { Tone } from './nodes'

export interface Painter {
  fillRect(rect: Rect, color: string): void
  strokeRect(rect: Rect, color: string, width: number): void
  text(text: string, x: number, y: number, size: number, color: string): void
  measure(text: string, size: number): number
}

export type Theme = Readonly<{
  background: string
  panel: string
  border: string
  focus: string
  button: string
  buttonDisabled: string
  tones: Readonly<Record<Tone, string>>
}>

export const DEFAULT_THEME: Theme = {
  background: '#14161a',
  panel: '#1c2026',
  border: '#3a3f47',
  focus: '#6fd3e8',
  button: '#242a31',
  buttonDisabled: '#1a1d22',
  tones: { normal: '#e8dcc0', dim: '#8a8374', accent: '#6fd3e8', warn: '#e0894a' }
}