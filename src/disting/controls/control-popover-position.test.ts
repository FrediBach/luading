import { describe, expect, it } from 'vitest'
import { calculatePopoverPosition } from './control-popover-position'

describe('control popover viewport positioning', () => {
  it('opens below a control when the content fits', () => {
    expect(calculatePopoverPosition(
      { top: 100, right: 500, bottom: 140 },
      { width: 320, height: 240 },
      800,
      600,
    )).toEqual({
      top: 146,
      left: 180,
      maxHeight: 446,
      placement: 'below',
    })
  })

  it('flips above controls near the bottom of the viewport', () => {
    expect(calculatePopoverPosition(
      { top: 500, right: 760, bottom: 540 },
      { width: 390, height: 300 },
      800,
      600,
    )).toEqual({
      top: 194,
      left: 370,
      maxHeight: 480,
      placement: 'above',
    })
  })

  it('clamps wide popovers to the viewport edge and available height', () => {
    expect(calculatePopoverPosition(
      { top: 30, right: 80, bottom: 70 },
      { width: 470, height: 600 },
      500,
      240,
    )).toEqual({
      top: 76,
      left: 8,
      maxHeight: 156,
      placement: 'below',
    })
  })
})
