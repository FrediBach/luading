import { describe, expect, it } from 'vitest'
import type { DrawCommand } from '../types'
import { renderDistingDisplay } from './display-renderer'

interface Fill {
  style: string
  x: number
  y: number
  width: number
  height: number
}

function recordingContext() {
  const fills: Fill[] = []
  const context = {
    fillStyle: '',
    strokeStyle: '',
    imageSmoothingEnabled: true,
    lineWidth: 0,
    save() {},
    restore() {},
    fillRect(
      this: { fillStyle: string },
      x: number,
      y: number,
      width: number,
      height: number,
    ) {
      fills.push({ style: this.fillStyle, x, y, width, height })
    },
  } as unknown as CanvasRenderingContext2D

  return { context, fills }
}

describe('Disting display renderer fonts', () => {
  it('renders standard text from the atlas without a browser font API', () => {
    const { context, fills } = recordingContext()
    const commands: DrawCommand[] = [
      { kind: 'text', x: 0, y: 7, text: 'A', shade: 15, tiny: false, align: 'left' },
    ]

    renderDistingDisplay(context, commands)

    const glyphPixels = fills.filter((fill) => fill.width === 1 && fill.height === 1)
    expect(glyphPixels[0]).toEqual({
      style: 'rgb(1, 96, 96)',
      x: 2,
      y: 0,
      width: 1,
      height: 1,
    })
    expect(glyphPixels.some((pixel) => pixel.style === 'rgb(2, 225, 223)')).toBe(true)
    expect(glyphPixels.every((pixel) => pixel.x >= 0 && pixel.y >= 0)).toBe(true)
  })

  it('uses #02F1EF for fully lit display pixels and black for the background', () => {
    const { context, fills } = recordingContext()
    const commands: DrawCommand[] = [
      { kind: 'text', x: 0, y: 4, text: 'A', shade: 15, tiny: true, align: 'left' },
    ]

    renderDistingDisplay(context, commands)

    expect(fills[0]).toMatchObject({ style: '#000', x: 0, y: 0, width: 256, height: 64 })
    expect(fills.some((fill) => fill.style === 'rgb(2, 241, 239)')).toBe(true)
  })

  it('clips atlas pixels to the 256x64 framebuffer', () => {
    const { context, fills } = recordingContext()
    const commands: DrawCommand[] = [
      { kind: 'text', x: 255, y: 64, text: 'W', shade: 15, tiny: false, align: 'left' },
    ]

    renderDistingDisplay(context, commands)

    const glyphPixels = fills.filter((fill) => fill.width === 1 && fill.height === 1)
    expect(glyphPixels.every((pixel) => pixel.x < 256 && pixel.y < 64)).toBe(true)
  })

  it('quantizes antialiased text to the display sixteen-shade palette', () => {
    const { context, fills } = recordingContext()
    const commands: DrawCommand[] = [
      { kind: 'text', x: 0, y: 7, text: 'A', shade: 8, tiny: false, align: 'left' },
    ]

    renderDistingDisplay(context, commands)

    const palette = Array.from({ length: 16 }, (_, shade) => {
      const red = Math.round((2 * shade) / 15)
      const green = Math.round((241 * shade) / 15)
      const blue = Math.round((239 * shade) / 15)
      return `rgb(${red}, ${green}, ${blue})`
    })
    const styles = fills
      .filter((fill) => fill.width === 1 && fill.height === 1)
      .map((fill) => fill.style)
    expect(styles.every((style) => palette.includes(style))).toBe(true)
    expect(styles).toContain('rgb(1, 112, 112)')
  })
})
