import { describe, expect, it } from 'vitest'
import type { ParameterDefinition } from '../types'
import { buildParameterLineCommands, DistingDisplayApi } from './display-api'

type DrawFunction = (...args: unknown[]) => unknown

function registeredDisplay(
  onCall?: (name: string) => void,
  parameter?: ParameterDefinition,
) {
  const functions = new Map<string, DrawFunction>()
  const display = new DistingDisplayApi()
  display.register({
    set(name, value) {
      functions.set(name, value as DrawFunction)
    },
  }, onCall, {
    algorithmName: (index) => index === 2 ? 'Looper' : undefined,
    parameter: (algorithm, index) => (
      algorithm === 2 && index === 1 && parameter
        ? { definition: parameter, value: parameter.value }
        : undefined
    ),
  })
  const call = (name: string, ...args: unknown[]) => functions.get(name)?.(...args)
  return { call, display }
}

describe('Disting display API', () => {
  it('builds the reusable standard parameter-line command sequence', () => {
    expect(buildParameterLineCommands('Cutoff', '1.25 kHz', 3)).toEqual([
      { kind: 'text', x: 2, y: 10, text: 'Cutoff', shade: 15, tiny: true, align: 'left' },
      { kind: 'text', x: 253, y: 10, text: '1.25 kHz', shade: 15, tiny: true, align: 'right' },
      { kind: 'line', x1: 0, y1: 12, x2: 255, y2: 12, shade: 5, smooth: false },
    ])
  })

  it('implements integer and smooth drawing coordinate rules', () => {
    const calls: string[] = []
    const { call, display } = registeredDisplay((name) => calls.push(name))

    call('drawLine', 1.9, 2.1, 3.8, 4.9, 20)
    call('drawSmoothLine', 1.9, 2.1, 3.8, 4.9, -2)
    call('drawBox', 1.9, 2.1, 3.8, 4.9)
    call('drawSmoothBox', 1.9, 2.1, 3.8, 4.9, 7.5)
    call('drawRectangle', 1.9, 2.1, 3.8, 4.9, 4)

    expect(display.commands).toEqual([
      { kind: 'line', x1: 1, y1: 2, x2: 3, y2: 4, shade: 15, smooth: false },
      { kind: 'line', x1: 1.9, y1: 2.1, x2: 3.8, y2: 4.9, shade: 0, smooth: true },
      { kind: 'box', x1: 1, y1: 2, x2: 3, y2: 4, shade: 15, fill: false, smooth: false },
      { kind: 'box', x1: 1.9, y1: 2.1, x2: 3.8, y2: 4.9, shade: 7.5, fill: false, smooth: true },
      { kind: 'box', x1: 1, y1: 2, x2: 3, y2: 4, shade: 4, fill: true, smooth: false },
    ])
    expect(calls).toEqual([
      'drawLine',
      'drawSmoothLine',
      'drawBox',
      'drawSmoothBox',
      'drawRectangle',
    ])
  })

  it('normalizes circles, text defaults, colours, and alignments', () => {
    const { call, display } = registeredDisplay()

    call('drawCircle', 10.8, 20.2, -4.9)
    call('drawSmoothCircle', 10.8, 20.2, -4.9, 8.25)
    call('drawText', 30.8, 40.2, 123)
    call('drawTinyText', 30, 40, 'Tiny', 6, 'centre')
    call('drawText', 30, 40, 'Fallback', 6, 'invalid')

    expect(display.commands).toEqual([
      { kind: 'circle', x: 10, y: 20, radius: 4, shade: 15, smooth: false },
      { kind: 'circle', x: 10.8, y: 20.2, radius: 4.9, shade: 8.25, smooth: true },
      { kind: 'text', x: 30, y: 40, text: '123', shade: 15, tiny: false, align: 'left' },
      { kind: 'text', x: 30, y: 40, text: 'Tiny', shade: 6, tiny: true, align: 'centre' },
      { kind: 'text', x: 30, y: 40, text: 'Fallback', shade: 6, tiny: false, align: 'left' },
    ])
  })

  it('implements standard-line suppression and explicit requests', () => {
    const parameter: ParameterDefinition = {
      name: 'Fine',
      min: -1,
      max: 1,
      value: 0.25,
      unit: 'V',
      scale: 100,
    }
    const { call, display } = registeredDisplay(undefined, parameter)

    expect(display.finish(true, parameter, 0.25)).toEqual([])
    call('drawStandardParameterLine')
    display.finish(true, parameter, 0.25)

    expect(display.commands).toEqual([
      { kind: 'text', x: 2, y: 7, text: 'Fine', shade: 15, tiny: true, align: 'left' },
      { kind: 'text', x: 253, y: 7, text: '0.25 V', shade: 15, tiny: true, align: 'right' },
      { kind: 'line', x1: 0, y1: 9, x2: 255, y2: 9, shade: 5, smooth: false },
    ])
  })

  it('draws explicit parameter lines, enum labels, and algorithm UI placeholders', () => {
    const parameter: ParameterDefinition = {
      name: 'Mode',
      min: 1,
      max: 2,
      value: 2,
      unit: '',
      scale: 1,
      enumValues: ['Bounce', 'Warp'],
    }
    const { call, display } = registeredDisplay(undefined, parameter)

    call('drawParameterLine', 2, 1, 4.8)
    call('drawAlgorithmUI', 2)

    expect(display.commands.slice(0, 3)).toEqual([
      { kind: 'text', x: 2, y: 11, text: 'Mode', shade: 15, tiny: true, align: 'left' },
      { kind: 'text', x: 253, y: 11, text: 'Warp', shade: 15, tiny: true, align: 'right' },
      { kind: 'line', x1: 0, y1: 13, x2: 255, y2: 13, shade: 5, smooth: false },
    ])
    expect(display.commands.slice(3)).toEqual([
      { kind: 'text', x: 128, y: 27, text: 'Looper', shade: 15, tiny: false, align: 'centre' },
      { kind: 'text', x: 128, y: 40, text: 'Simulated algorithm UI', shade: 7, tiny: true, align: 'centre' },
    ])
  })

  it('formats zero-based firmware enums', () => {
    const parameter: ParameterDefinition = {
      name: 'Output mode',
      min: 0,
      max: 1,
      value: 0,
      unit: '',
      scale: 1,
      enumValues: ['Add', 'Replace'],
      enumOffset: 0,
    }
    const { display } = registeredDisplay(undefined, parameter)

    display.finish(false, parameter, 0)

    expect(display.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'text', text: 'Add' }),
    ]))
  })

  it('resets state and renders non-algorithm system screens', () => {
    const { call, display } = registeredDisplay()
    call('drawText', 1, 2, 'Old')
    display.requestStandardParameterLine()
    display.reset()
    display.showSystemScreen('meters', 'Lua Script')

    expect(display.commands).toEqual([
      { kind: 'text', x: 128, y: 24, text: 'METERS', shade: 8, tiny: true, align: 'centre' },
      { kind: 'text', x: 128, y: 39, text: 'Lua Script', shade: 15, tiny: false, align: 'centre' },
    ])
  })
})
