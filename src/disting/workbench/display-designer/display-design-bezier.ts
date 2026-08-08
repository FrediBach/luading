import type { DrawCommand } from '../../types'

export interface ResolvedDisplayBezierPoint {
  x: number
  y: number
}

function roundedPixel(value: number): number {
  return Math.floor(value + 0.5)
}

/** Evaluates a general-degree Bézier with de Casteljau interpolation. */
export function evaluateDisplayBezier(
  points: readonly ResolvedDisplayBezierPoint[],
  amount: number,
): ResolvedDisplayBezierPoint {
  const working = points.map(({ x, y }) => ({ x, y }))
  for (let level = working.length - 1; level > 0; level -= 1) {
    for (let index = 0; index < level; index += 1) {
      const current = working[index]!
      const next = working[index + 1]!
      current.x += (next.x - current.x) * amount
      current.y += (next.y - current.y) * amount
    }
  }
  return working[0] ?? { x: 0, y: 0 }
}

export function compileDisplayBezierLines(
  points: readonly ResolvedDisplayBezierPoint[],
  segments: number,
  shade: number,
): DrawCommand[] {
  if (points.length < 2 || segments < 1) return []
  const commands: DrawCommand[] = []
  let previous = { x: roundedPixel(points[0]!.x), y: roundedPixel(points[0]!.y) }
  for (let segment = 1; segment <= segments; segment += 1) {
    const evaluated = evaluateDisplayBezier(points, segment / segments)
    const next = { x: roundedPixel(evaluated.x), y: roundedPixel(evaluated.y) }
    commands.push({ kind: 'line', x1: previous.x, y1: previous.y, x2: next.x, y2: next.y, shade, smooth: false })
    previous = next
  }
  return commands
}
