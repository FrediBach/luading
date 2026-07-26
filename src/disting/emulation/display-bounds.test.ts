import { describe, expect, it } from 'vitest'
import type { DrawCommand } from '../types'
import { findFirstTextOverflow } from './display-bounds'

describe('Disting display text bounds', () => {
  it('accepts user text whose rasterized pixels fit the framebuffer', () => {
    const commands: DrawCommand[] = [
      { kind: 'text', x: 10, y: 60, text: 'User text', shade: 15, tiny: false, align: 'left' },
    ]

    expect(findFirstTextOverflow(commands)).toBeUndefined()
  })

  it('reports the original command and rasterized bounds for clipped text', () => {
    const command: DrawCommand = {
      kind: 'text',
      x: 10,
      y: 68,
      text: 'CV: +0.00V',
      shade: 15,
      tiny: false,
      align: 'left',
    }

    expect(findFirstTextOverflow([command])).toEqual({
      command,
      bounds: {
        left: 10,
        top: 61,
        right: 56,
        bottom: 67,
      },
    })
  })

  it('checks horizontal alignment and ignores non-text commands', () => {
    const commands: DrawCommand[] = [
      { kind: 'line', x1: -10, y1: 0, x2: 300, y2: 0, shade: 15, smooth: false },
      { kind: 'text', x: 0, y: 20, text: 'Right', shade: 15, tiny: false, align: 'right' },
    ]

    expect(findFirstTextOverflow(commands)?.bounds.left).toBeLessThan(0)
  })
})
