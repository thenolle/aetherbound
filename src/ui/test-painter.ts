import type { Rect } from './geometry'
import type { Painter } from './painter'

export class RecordingPainter implements Painter {
  readonly ops: string[] = []

  fillRect(rect: Rect, color: string): void {
    this.ops.push(`fill ${rect.x},${rect.y},${rect.width},${rect.height} ${color}`)
  }

  strokeRect(rect: Rect, color: string, width: number): void {
    this.ops.push(`stroke ${rect.x},${rect.y},${rect.width},${rect.height} ${color} ${width}`)
  }

  text(text: string, x: number, y: number, size: number, color: string): void {
    this.ops.push(`text ${text} ${x},${y} ${size} ${color}`)
  }

  measure(text: string, size: number): number {
    return text.length * size * 0.5
  }
}