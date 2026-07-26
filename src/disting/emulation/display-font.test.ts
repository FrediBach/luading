import { describe, expect, it } from 'vitest'
import {
  fontAtlas,
  measureDistingText,
  rasterizeDistingText,
} from './display-font'

describe('Disting display fonts', () => {
  it('pins the firmware-derived font metrics', () => {
    expect(fontAtlas(false)).toMatchObject({
      pixelSize: 10,
      ascent: 10,
      descent: 3,
      lineHeight: 12,
    })
    expect(fontAtlas(true)).toMatchObject({
      pixelSize: 5,
      ascent: 5,
      descent: 0,
      lineHeight: 5,
    })
    expect(measureDistingText('Hello!', false)).toBe(27)
    expect(measureDistingText('Hello!', true)).toBe(20)
  })

  it('contains internally consistent 4-bit glyph coverage', () => {
    for (const tiny of [false, true]) {
      for (const glyph of Object.values(fontAtlas(tiny).glyphs)) {
        expect(glyph.data).toHaveLength(glyph.width * glyph.height)
        expect(glyph.data).toMatch(/^[0-9a-f]*$/)
      }
    }
  })

  it('preserves case in the pixelmix tiny font', () => {
    const upper = rasterizeDistingText(0, 4, 'A', true, 'left')
    const lower = rasterizeDistingText(0, 4, 'a', true, 'left')

    expect(upper).not.toEqual(lower)
    expect(Math.min(...upper.map((pixel) => pixel.y))).toBe(0)
    expect(Math.min(...lower.map((pixel) => pixel.y))).toBe(1)
  })

  it('uses advances for left, centre, and right alignment', () => {
    const left = rasterizeDistingText(20, 10, 'Hi', false, 'left')
    const centre = rasterizeDistingText(20, 10, 'Hi', false, 'centre')
    const right = rasterizeDistingText(20, 10, 'Hi', false, 'right')
    const minimumX = (pixels: typeof left) => Math.min(...pixels.map((pixel) => pixel.x))

    expect(measureDistingText('Hi', false)).toBe(10)
    expect(minimumX(left)).toBe(21)
    expect(minimumX(centre)).toBe(16)
    expect(minimumX(right)).toBe(11)
  })

  it('falls back to the question-mark glyph for unsupported characters', () => {
    const unsupported = rasterizeDistingText(0, 10, '▶', false, 'left')
    const fallback = rasterizeDistingText(0, 10, '?', false, 'left')

    expect(unsupported).toEqual(fallback)
    expect(measureDistingText('▶', false)).toBe(measureDistingText('?', false))
  })

  it('returns no pixels for an empty string or a space', () => {
    expect(rasterizeDistingText(0, 10, '', false, 'left')).toEqual([])
    expect(rasterizeDistingText(0, 10, ' ', false, 'left')).toEqual([])
  })
})
