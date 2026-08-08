import type { DrawCommand } from '../../types'
import type { DisplayAnimatedLineDirection, DisplayAnimatedLineSpeed } from './display-design-model'

export const DISPLAY_ANIMATED_LINE_DASH_LENGTH = 4
export const DISPLAY_ANIMATED_LINE_PATTERN_LENGTH = DISPLAY_ANIMATED_LINE_DASH_LENGTH * 2

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

export function compileDisplayAnimatedLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  primaryShade: number,
  secondaryShade: number,
  direction: DisplayAnimatedLineDirection,
  speed: DisplayAnimatedLineSpeed,
  displayFrame = 0,
): DrawCommand[] {
  const horizontal = direction === 'left' || direction === 'right'
  const start = Math.min(horizontal ? Math.round(x1) : Math.round(y1), horizontal ? Math.round(x2) : Math.round(y2))
  const end = Math.max(horizontal ? Math.round(x1) : Math.round(y1), horizontal ? Math.round(x2) : Math.round(y2))
  const fixed = horizontal ? Math.round(y1) : Math.round(x1)
  const framesPerStep = 30 / speed
  const phase = Math.floor(Math.floor(displayFrame) / framesPerStep)
  const signedPhase = direction === 'right' || direction === 'down' ? -phase : phase
  const commands: DrawCommand[] = []
  let runStart = start
  let runShade = primaryShade

  const shadeAt = (position: number) => positiveModulo(position - start + signedPhase, DISPLAY_ANIMATED_LINE_PATTERN_LENGTH) < DISPLAY_ANIMATED_LINE_DASH_LENGTH
    ? primaryShade
    : secondaryShade

  runShade = shadeAt(start)
  for (let position = start + 1; position <= end + 1; position += 1) {
    const nextShade = position <= end ? shadeAt(position) : Number.NaN
    if (nextShade === runShade) continue
    const runEnd = position - 1
    commands.push(horizontal
      ? { kind: 'line', x1: runStart, y1: fixed, x2: runEnd, y2: fixed, shade: runShade, smooth: false }
      : { kind: 'line', x1: fixed, y1: runStart, x2: fixed, y2: runEnd, shade: runShade, smooth: false })
    runStart = position
    runShade = nextShade
  }
  return commands
}
