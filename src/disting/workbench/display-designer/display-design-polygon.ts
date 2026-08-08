import type { DrawCommand } from '../../types'

export interface DisplayPolygonPoint {
  x: number
  y: number
}

function luaRound(value: number): number {
  return Math.floor(value + 0.5)
}

export function displayPolygonVertices(
  x: number,
  y: number,
  radius: number,
  sides: number,
): DisplayPolygonPoint[] {
  const count = Math.max(3, Math.trunc(sides))
  const step = Math.PI * 2 / count
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + index * step
    return {
      x: luaRound(x + Math.cos(angle) * radius),
      y: luaRound(y + Math.sin(angle) * radius),
    }
  })
}

export function compileDisplayPolygonLines(
  x: number,
  y: number,
  radius: number,
  sides: number,
  shade: number,
): DrawCommand[] {
  const vertices = displayPolygonVertices(x, y, radius, sides)
  return vertices.map((start, index): DrawCommand => {
    const end = vertices[(index + 1) % vertices.length]!
    return {
      kind: 'line',
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      shade,
      smooth: false,
    }
  })
}
