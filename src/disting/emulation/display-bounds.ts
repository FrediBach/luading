import { DISTING_DISPLAY, type DrawCommand } from '../types'
import { rasterizeDistingText } from './display-font'

export interface TextOverflow {
  command: Extract<DrawCommand, { kind: 'text' }>
  bounds: {
    left: number
    top: number
    right: number
    bottom: number
  }
}

export function findFirstTextOverflow(commands: DrawCommand[]): TextOverflow | undefined {
  for (const command of commands) {
    if (command.kind !== 'text') continue

    const pixels = rasterizeDistingText(
      command.x,
      command.y,
      command.text,
      command.tiny,
      command.align,
    )
    if (pixels.length === 0) continue

    const xs = pixels.map((pixel) => pixel.x)
    const ys = pixels.map((pixel) => pixel.y)
    const bounds = {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    }

    if (
      bounds.left < 0
      || bounds.top < 0
      || bounds.right >= DISTING_DISPLAY.width
      || bounds.bottom >= DISTING_DISPLAY.height
    ) {
      return { command, bounds }
    }
  }

  return undefined
}
