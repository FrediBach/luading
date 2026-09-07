import { renderDistingDisplay } from '../emulation/display-renderer'
import type { DrawCommand } from '../types'

/** Record the production renderer's final pixels without a DOM or native canvas. */
export function renderDisplayTestPixels(commands: DrawCommand[], width = 256, height = 64): Uint8Array {
  const pixels = new Uint8Array(width * height)
  const context = {
    fillStyle: '#000',
    save() {},
    restore() {},
    fillRect(this: { fillStyle: string }, x: number, y: number, w: number, h: number) {
      const green = this.fillStyle === '#000' ? 0 : Number(this.fillStyle.split(',')[1])
      const shade = Math.round(green * 15 / 241)
      for (let row = Math.max(0, y); row < Math.min(height, y + h); row += 1) {
        for (let column = Math.max(0, x); column < Math.min(width, x + w); column += 1) {
          pixels[row * width + column] = shade
        }
      }
    },
  } as unknown as CanvasRenderingContext2D
  renderDistingDisplay(context, commands)
  return pixels
}
