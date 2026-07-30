import { describe, expect, it } from 'vitest'
import {
  buttonControlAt,
  createUiEventRequest,
  encoderControlAt,
  normalizePotPosition,
  potControlAt,
} from './hardware-controls'

describe('Disting hardware control mapping', () => {
  it('maps zero-based component positions to typed Disting controls', () => {
    expect([0, 1, 2].map(potControlAt)).toEqual(['pot1', 'pot2', 'pot3'])
    expect([0, 1].map(encoderControlAt)).toEqual(['encoder1', 'encoder2'])
    expect([0, 1, 2, 3].map(buttonControlAt)).toEqual([
      'button1',
      'button2',
      'button3',
      'button4',
    ])
  })

  it('rejects invalid hardware positions', () => {
    expect(potControlAt(-1)).toBeNull()
    expect(potControlAt(3)).toBeNull()
    expect(encoderControlAt(2)).toBeNull()
    expect(buttonControlAt(4)).toBeNull()
    expect(buttonControlAt(1.5)).toBeNull()
  })

  it('normalizes absolute pot turns to the hardware range', () => {
    expect(normalizePotPosition(-1)).toBe(0)
    expect(normalizePotPosition(0.375)).toBe(0.375)
    expect(normalizePotPosition(2)).toBe(1)
    expect(normalizePotPosition(Number.NaN)).toBe(0.5)
  })

  it('constructs the existing typed UI event messages exactly', () => {
    expect(createUiEventRequest('pot1', 'turn', 0.625)).toEqual({
      type: 'uiEvent',
      control: 'pot1',
      event: 'turn',
      value: 0.625,
    })
    expect(createUiEventRequest('encoder2', 'turn', -1)).toEqual({
      type: 'uiEvent',
      control: 'encoder2',
      event: 'turn',
      value: -1,
    })
    expect(createUiEventRequest('button4', 'push')).toEqual({
      type: 'uiEvent',
      control: 'button4',
      event: 'push',
    })
    expect(createUiEventRequest('button4', 'release')).toEqual({
      type: 'uiEvent',
      control: 'button4',
      event: 'release',
    })
  })
})
