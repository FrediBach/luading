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
      style: 'rgb(102, 102, 102)',
      x: 2,
      y: 0,
      width: 1,
      height: 1,
    })
    expect(glyphPixels.some((pixel) => pixel.style === 'rgb(238, 238, 238)')).toBe(true)
    expect(glyphPixels.every((pixel) => pixel.x >= 0 && pixel.y >= 0)).toBe(true)
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

    const intensities = fills
      .filter((fill) => fill.width === 1 && fill.height === 1)
      .map((fill) => Number.parseInt(fill.style.match(/\d+/)?.[0] ?? '', 10))
    expect(intensities.every((intensity) => intensity % 17 === 0)).toBe(true)
    expect(Math.max(...intensities)).toBe(119)
  })
})
