import { describe, expect, it } from 'vitest'
import { parseSvgPath, svgArc, svgNumbers, svgTransform } from './display-design-svg-path'
import { svgPoint } from './display-design-svg-model'

describe('SVG geometry contract', () => {
  it('preserves relative/repeated commands, subpaths and closepath', () => {
    const paths = parseSvgPath('m 2 3 4 0 h 2 v 4 l -6 0 z M20 20L21 21')
    expect(paths).toHaveLength(2)
    expect(paths[0]?.closed).toBe(true)
    expect(paths[0]?.segments.at(-1)?.points.at(-1)).toEqual({ x: 2, y: 3 })
    expect(paths[1]?.segments[0]?.points).toEqual([{ x: 20, y: 20 }, { x: 21, y: 21 }])
  })
  it('reflects only compatible preceding curve controls', () => {
    const path = parseSvgPath('M0 0 Q2 4 4 0 T8 0 C9 1 10 2 11 0 S13 -2 14 0 L15 0 T16 0')[0]!
    expect(path.segments[1]?.points[1]).toEqual({ x: 6, y: -4 })
    expect(path.segments[3]?.points[1]).toEqual({ x: 12, y: -2 })
    expect(path.segments[5]?.points[1]).toEqual({ x: 15, y: 0 })
  })
  it('normalizes arcs and degenerate arcs without losing endpoints', () => {
    const arc = svgArc({ x: 0, y: 0 }, 10, 5, 20, 1, 1, { x: 20, y: 0 })
    expect(arc.length).toBeGreaterThanOrEqual(2)
    expect(arc.at(-1)?.at(-1)).toEqual({ x: 20, y: 0 })
    expect(svgArc({ x: 0, y: 0 }, 0, 5, 0, 0, 1, { x: 2, y: 3 })).toEqual([[{ x: 0, y: 0 }, { x: 2, y: 3 }]])
    expect(parseSvgPath('M0 0 a10 5 0 0 1 20 0')[0]?.segments.length).toBe(2)
  })
  it('composes affine transforms in SVG order', () => {
    expect(svgPoint(svgTransform('translate(10,20) scale(2)'), { x: 1, y: 2 })).toEqual({ x: 12, y: 24 })
    expect(svgPoint(svgTransform('rotate(90 1 1)'), { x: 2, y: 1 }).y).toBeCloseTo(2)
    expect(svgTransform('matrix(1 0 0 1 0 0) skewX(0) skewY(0)')).toEqual([1, 0, 0, 1, 0, 0])
  })
  it('rejects malformed data and cumulative expansion limits', () => {
    for (const d of ['L1 2', 'M0 0 L2', 'MNaN 2', 'M0 0 A2 2 0 4 0 2 3', 'M0 0 R2 2']) expect(() => parseSvgPath(d)).toThrow()
    expect(() => parseSvgPath('M0 0L1 1', { commands: 50_000 })).toThrow(/limit/)
    expect(() => svgNumbers('1foo')).toThrow()
    expect(() => svgTransform('translate(1) url(x)')).toThrow()
  })
})

describe('SVG path regression cases', () => {
  it('accepts compact arc flags and treats a command after closepath as a new contour', () => {
    expect(parseSvgPath('M0 0A10 10 0 0120 0')[0]?.segments.at(-1)?.points.at(-1)).toEqual({ x: 20, y: 0 })
    const paths = parseSvgPath('M0 0L10 0L10 10ZL20 20')
    expect(paths).toHaveLength(2)
    expect(paths[1]).toMatchObject({ start: { x: 0, y: 0 }, closed: false })
  })
})
