import { describe, expect, it } from 'vitest'
import {
  addDisplayDesignBinding,
  addDisplayDesignElement,
  createDefaultDisplayBinding,
  createDefaultDisplayPrimitive,
  createEmptyDisplayDesign,
  createSequentialDisplayDesignIdFactory,
} from './display-design-model'
import {
  generateDisplayLayoutGridLines,
  snapDisplayAxisToLayoutGrid,
  snapDisplayPointToLayoutGrid,
  snapDisplaySelectionTranslation,
} from './display-design-snapping'

const fitRect = { left: 12.25, top: -7.5, width: 512.5, height: 128.125 }
const fourXRect = { left: 0, top: 0, width: 1024, height: 256 }

describe('display design layout-grid snapping', () => {
  it('generates uniform grid lines for sizes 1, 8, and 64 including artboard edges', () => {
    expect(generateDisplayLayoutGridLines(1).x).toHaveLength(257)
    expect(generateDisplayLayoutGridLines(8)).toEqual({
      x: Array.from({ length: 33 }, (_, index) => index * 8),
      y: Array.from({ length: 9 }, (_, index) => index * 8),
    })
    expect(generateDisplayLayoutGridLines(64)).toEqual({ x: [0, 64, 128, 192, 256], y: [0, 64] })
    expect(generateDisplayLayoutGridLines(10)).toEqual({
      x: Array.from({ length: 26 }, (_, index) => index * 10),
      y: Array.from({ length: 7 }, (_, index) => index * 10),
    })
  })

  it('uses measured screen-space distance at fractional Fit and explicit zoom bounds', () => {
    const fit = snapDisplayPointToLayoutGrid({
      point: { x: 11.5, y: 15 }, gridSize: 8, rect: fitRect, precision: 0.5,
    })
    expect(fit.point).toEqual({ x: 11.5, y: 16 })

    const fourX = snapDisplayPointToLayoutGrid({
      point: { x: 9, y: 7 }, gridSize: 8, rect: fourXRect, precision: 1,
    })
    expect(fourX.point).toEqual({ x: 8, y: 8 })
  })

  it('snaps axes independently and clamps nearest targets to artboard edges', () => {
    const result = snapDisplayPointToLayoutGrid({
      point: { x: -1, y: 63 }, gridSize: 8, rect: fourXRect, precision: 1,
    })
    expect(result.point).toEqual({ x: 0, y: 64 })
    expect(result.guides.map(({ label }) => label)).toEqual(['x 0', 'y 64'])
  })

  it('uses leading, trailing, then centre as deterministic tie priority', () => {
    const result = snapDisplayAxisToLayoutGrid({
      axis: 'x', gridSize: 8, rect: fourXRect, precision: 1,
      candidates: [
        { id: 'centre', coordinate: 9, priority: 'centre' },
        { id: 'trailing', coordinate: 7, priority: 'trailing' },
        { id: 'leading', coordinate: 9, priority: 'leading' },
      ],
    })
    expect(result.target?.candidateId).toBe('leading')
  })

  it('filters corrections that cannot preserve whole or half-pixel precision', () => {
    const whole = snapDisplayAxisToLayoutGrid({
      axis: 'x', gridSize: 8, rect: fourXRect, precision: 1,
      candidates: [{ id: 'centre', coordinate: 7.5, priority: 'centre' }],
    })
    const half = snapDisplayAxisToLayoutGrid({
      axis: 'x', gridSize: 8, rect: fourXRect, precision: 0.5,
      candidates: [{ id: 'centre', coordinate: 7.5, priority: 'centre' }],
    })
    expect(whole.target).toBeUndefined()
    expect(half).toMatchObject({ correction: 0.5, target: { coordinate: 8 } })
  })

  it('enters within six CSS pixels, retains through eight, and re-enters after Control bypass', () => {
    const entered = snapDisplayPointToLayoutGrid({
      point: { x: 9, y: 20 }, gridSize: 8, rect: fourXRect, precision: 1,
    })
    expect(entered.state.x?.coordinate).toBe(8)
    const retained = snapDisplayPointToLayoutGrid({
      point: { x: 10, y: 20 }, gridSize: 8, rect: fourXRect, precision: 1, active: entered.state,
    })
    expect(retained.state.x?.coordinate).toBe(8)
    const bypassed = snapDisplayPointToLayoutGrid({
      point: { x: 9, y: 20 }, gridSize: 8, rect: fourXRect, precision: 1, active: retained.state, disabled: true,
    })
    expect(bypassed.state).toEqual({})
    expect(snapDisplayPointToLayoutGrid({
      point: { x: 9, y: 20 }, gridSize: 8, rect: fourXRect, precision: 1, active: bypassed.state,
    }).state.x?.coordinate).toBe(8)
  })

  it('moves multi-selections rigidly and honours parameter-line constraints', () => {
    const ids = createSequentialDisplayDesignIdFactory('snap')
    const line = createDefaultDisplayPrimitive('pixel-line', ids)
    const box = createDefaultDisplayPrimitive('outline-box', ids)
    const document = {
      ...createEmptyDisplayDesign(),
      elements: [line, box],
    }
    const result = snapDisplaySelectionTranslation({
      document, elementIds: [line.id, box.id], requested: { x: 7, y: -7 },
      gridSize: 8, rect: fourXRect,
    })
    expect(result.delta).toEqual({ x: 8, y: -6 })
    expect(result.state.y).toBeUndefined()
    expect(result.state.x?.coordinate).toBe(16)
  })

  it('supports smooth-only selection corrections at half-pixel precision', () => {
    const ids = createSequentialDisplayDesignIdFactory('smooth')
    const circle = createDefaultDisplayPrimitive('smooth-circle', ids)
    const document = addDisplayDesignElement(createEmptyDisplayDesign(), circle)
    const result = snapDisplaySelectionTranslation({
      document, elementIds: [circle.id], requested: { x: 1, y: 0.5 },
      gridSize: 8, rect: fourXRect,
    })
    expect(result.delta.x % 0.5).toBe(0)
    expect(result.delta.y % 0.5).toBe(0)
  })

  it('snaps dynamic outer bounds by shifting their complete mapping span', () => {
    const ids = createSequentialDisplayDesignIdFactory('dynamic')
    const binding = createDefaultDisplayBinding('number', ids)
    const line = createDefaultDisplayPrimitive('pixel-line', ids)
    if (binding.kind !== 'number') throw new Error('Expected number binding')
    line.x1 = { kind: 'number-binding', bindingId: binding.id, from: { kind: 'literal', value: 8 }, to: { kind: 'literal', value: 8 }, quantize: 'integer' }
    line.x2 = { kind: 'number-binding', bindingId: binding.id, from: { kind: 'literal', value: 8 }, to: { kind: 'literal', value: 8 }, quantize: 'integer' }
    const document = addDisplayDesignElement(addDisplayDesignBinding(createEmptyDisplayDesign(), binding), line)
    const result = snapDisplaySelectionTranslation({
      document, elementIds: [line.id], requested: { x: 1, y: 0 },
      gridSize: 8, rect: fourXRect,
    })
    expect(result.state.x?.coordinate).toBe(8)
    expect(result.guides).toContainEqual(expect.objectContaining({ axis: 'x', coordinate: 8 }))
  })

  it('snaps while grid rendering is hidden because visibility is not an engine input', () => {
    expect(snapDisplayPointToLayoutGrid({
      point: { x: 7, y: 9 }, gridSize: 8, rect: fourXRect, precision: 1,
    }).point).toEqual({ x: 8, y: 8 })
  })
})
