import { describe, expect, it } from 'vitest'
import { optimizeDisplayPixelBox } from './display-design-pixel-box'

function rasterize(width: number, height: number, regions: ReturnType<typeof optimizeDisplayPixelBox>): number[] {
  const pixels = Array<number>(width * height).fill(-1)
  for (const region of regions) {
    for (let y = region.y1; y <= region.y2; y += 1) {
      for (let x = region.x1; x <= region.x2; x += 1) pixels[y * width + x] = region.shade
    }
  }
  return pixels
}

describe('display pixel box optimizer', () => {
  it('collapses a solid pixel box to one filled region', () => {
    expect(optimizeDisplayPixelBox(4, 3, Array(12).fill(9))).toEqual([
      { x1: 0, y1: 0, x2: 3, y2: 2, shade: 9 },
    ])
  })

  it('merges horizontal and vertical runs and chooses the smaller partition', () => {
    expect(optimizeDisplayPixelBox(4, 3, [
      1, 1, 2, 2,
      1, 1, 2, 2,
      1, 1, 2, 2,
    ])).toHaveLength(2)
  })

  it('uses full-box overdraw when it reduces a framed image to two calls', () => {
    const shades = [
      3, 3, 3,
      3, 8, 3,
      3, 3, 3,
    ]
    const regions = optimizeDisplayPixelBox(3, 3, shades)
    expect(regions).toHaveLength(2)
    expect(rasterize(3, 3, regions)).toEqual(shades)
  })

  it('preserves all sixteen shades, including shade zero, exactly', () => {
    const shades = Array.from({ length: 16 }, (_, shade) => shade)
    const regions = optimizeDisplayPixelBox(4, 4, shades)
    expect(rasterize(4, 4, regions)).toEqual(shades)
  })

  it('rejects inconsistent dimensions safely', () => {
    expect(optimizeDisplayPixelBox(2, 2, [1, 2, 3])).toEqual([])
  })
})
