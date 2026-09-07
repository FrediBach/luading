import { describe, expect, it } from 'vitest'
import {
  fontAtlas,
  measureDistingText,
  rasterizeDistingText,
} from './display-font'

describe('Disting display fonts', () => {
  it('pins the Pixelmix 8px and Tom Thumb 6px approximation metrics', () => {
    expect(fontAtlas(false)).toMatchObject({
      pixelSize: 8,
      ascent: 8,
      descent: 0,
      lineHeight: 8,
    })
    expect(fontAtlas(true)).toMatchObject({
      pixelSize: 6,
      ascent: 5,
      descent: 1,
      lineHeight: 6,
    })
    expect(measureDistingText('Hello!', false)).toBe(28)
    expect(measureDistingText('Hello!', true)).toBe(24)
  })

  it('contains internally consistent 4-bit glyph coverage', () => {
    for (const tiny of [false, true]) {
      for (const glyph of Object.values(fontAtlas(tiny).glyphs)) {
        expect(glyph.data).toHaveLength(glyph.width * glyph.height)
        expect(glyph.data).toMatch(/^[0-9a-f]*$/)
      }
    }
  })

  it('keeps both pixel faces monochrome at their native size', () => {
    for (const tiny of [false, true]) {
      for (const glyph of Object.values(fontAtlas(tiny).glyphs)) {
        expect(glyph.data).toMatch(/^[0f]*$/)
      }
    }
    expect(fontAtlas(false).glyphs[65]).toMatchObject({
      width: 5, height: 7, advance: 6,
      data: '0fff0f000ff000fffffff000ff000ff000f',
    })
    expect(fontAtlas(true).glyphs[65]).toMatchObject({
      width: 3, height: 5, advance: 4,
      data: '0f0f0fffff0ff0f',
    })
  })

  it('keeps the tiny exclamation dot separate and descenders below the baseline', () => {
    expect(rasterizeDistingText(0, 5, '!', true, 'left')).toEqual([
      { x: 1, y: 0, coverage: 15 },
      { x: 1, y: 1, coverage: 15 },
      { x: 1, y: 2, coverage: 15 },
      { x: 1, y: 4, coverage: 15 },
    ])
    const descender = rasterizeDistingText(0, 5, 'y', true, 'left')
    expect(Math.max(...descender.map((pixel) => pixel.y))).toBe(5)
    expect(measureDistingText('Wi !', true)).toBe(16)
  })

  it('preserves case in the Tom Thumb tiny font', () => {
    const upper = rasterizeDistingText(0, 5, 'A', true, 'left')
    const lower = rasterizeDistingText(0, 5, 'a', true, 'left')

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
    expect(minimumX(left)).toBe(20)
    expect(minimumX(centre)).toBe(15)
    expect(minimumX(right)).toBe(10)
  })

  it('places standard glyphs relative to the requested baseline', () => {
    const capital = rasterizeDistingText(0, 7, 'A', false, 'left')
    const descender = rasterizeDistingText(0, 7, 'y', false, 'left')

    expect(Math.min(...capital.map((pixel) => pixel.y))).toBe(0)
    expect(Math.max(...capital.map((pixel) => pixel.y))).toBe(6)
    expect(Math.max(...descender.map((pixel) => pixel.y))).toBe(6)
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
