import { describe, expect, it } from 'vitest'
import {
  FREEFORM_CV_MAX_POINTS,
  FREEFORM_CV_MIN_PHASE_GAP,
} from '../emulation/signal-sources'
import type { FreeformCvPoint } from '../types'
import {
  addFreeformCvPoint,
  addFreeformCvPointInLargestGap,
  freeformCvPath,
  freeformCvPointFromClient,
  moveFreeformCvPoint,
  removeFreeformCvPoint,
} from './freeform-cv-editor'

const base: FreeformCvPoint[] = [
  { phase: 0, volts: 0 },
  { phase: 0.25, volts: 5 },
  { phase: 1, volts: -5 },
]

describe('freeform CV editor model', () => {
  it('maps client coordinates to clamped phase and voltage', () => {
    const bounds = { left: 10, top: 20, width: 200, height: 100 }
    expect(freeformCvPointFromClient(110, 70, bounds)).toEqual({ phase: 0.5, volts: 0 })
    expect(freeformCvPointFromClient(-20, -10, bounds)).toEqual({ phase: 0, volts: 10 })
    expect(freeformCvPointFromClient(500, 500, bounds)).toEqual({ phase: 1, volts: -10 })
  })

  it('adds, sorts, clamps, and selects a point', () => {
    const edit = addFreeformCvPoint(base, { phase: 0.75, volts: 20 })
    expect(edit.changed).toBe(true)
    expect(edit.selectedIndex).toBe(2)
    expect(edit.points[2]).toEqual({ phase: 0.75, volts: 10 })
    expect(base).toHaveLength(3)
  })

  it('adds a keyboard point in the largest gap on the interpolated line', () => {
    const edit = addFreeformCvPointInLargestGap(base)
    expect(edit.points[2]).toEqual({ phase: 0.625, volts: 0 })
    expect(edit.selectedIndex).toBe(2)
  })

  it('locks boundary phases and clamps interior points between neighbors', () => {
    expect(moveFreeformCvPoint(base, 0, { phase: 0.5, volts: 20 }).points[0])
      .toEqual({ phase: 0, volts: 10 })
    expect(moveFreeformCvPoint(base, 1, { phase: 2, volts: -20 }).points[1])
      .toEqual({ phase: 1 - FREEFORM_CV_MIN_PHASE_GAP, volts: -10 })
  })

  it('removes only interior points and keeps a predictable selection', () => {
    expect(removeFreeformCvPoint(base, 0).changed).toBe(false)
    expect(removeFreeformCvPoint(base, 2).changed).toBe(false)
    const edit = removeFreeformCvPoint(base, 1)
    expect(edit.points).toEqual([base[0], base[2]])
    expect(edit.selectedIndex).toBe(1)
  })

  it('enforces the point limit without changing existing points', () => {
    const points = Array.from({ length: FREEFORM_CV_MAX_POINTS }, (_, index) => ({
      phase: index / (FREEFORM_CV_MAX_POINTS - 1),
      volts: 0,
    }))
    const edit = addFreeformCvPoint(points, { phase: 0.5, volts: 4 })
    expect(edit.changed).toBe(false)
    expect(edit.points).toEqual(points)
  })

  it('builds a phase-spaced SVG path', () => {
    expect(freeformCvPath(base, 200, 100))
      .toBe('M0.00,50.00L50.00,25.00L200.00,75.00')
  })
})
