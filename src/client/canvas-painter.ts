import type { Rect } from '../ui/geometry'
import type { Painter } from '../ui/painter'

export class CanvasPainter implements Painter {
  private readonly pen: CanvasRenderingContext2D

  constructor(pen: CanvasRenderingContext2D) {
    this.pen = pen
  }

  fillRect(rect: Rect, color: string): void {
    this.pen.fillStyle = color
    this.pen.fillRect(rect.x, rect.y, rect.width, rect.height)
  }

  strokeRect(rect: Rect, color: string, width: number): void {
    this.pen.strokeStyle = color
    this.pen.lineWidth = width
    this.pen.strokeRect(rect.x + width / 2, rect.y + width / 2, Math.max(0, rect.width - width), Math.max(0, rect.height - width))
  }

  text(text: string, x: number, y: number, size: number, color: string): void {
    this.pen.font = `${size}px monospace`
    this.pen.textBaseline = 'top'
    this.pen.fillStyle = color
    this.pen.fillText(text, x, y)
  }

  measure(text: string, size: number): number {
    this.pen.font = `${size}px monospace`
    return this.pen.measureText(text).width
  }
}