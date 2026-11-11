export type Rect = Readonly<{ x: number, y: number, width: number, height: number }>

export const contains = (rect: Rect, x: number, y: number): boolean => x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height

export const inset = (rect: Rect, amount: number): Rect => ({
  x: rect.x + amount,
  y: rect.y + amount,
  width: Math.max(0, rect.width - amount * 2),
  height: Math.max(0, rect.height - amount * 2)
})