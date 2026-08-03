import { describe, expect, it } from 'vitest'
import type { LoadedProgram, ParameterDefinition } from '../types'
import {
  LUA_SCRIPT_PARAMETER_OFFSET,
  LuaScriptParameterModel,
  quantizeParameterValue,
} from './parameter-model'

function parameter(
  name: string,
  value: number,
  scale = 1,
): ParameterDefinition {
  return {
    name,
    min: 0,
    max: 10,
    value,
    unit: '',
    scale,
  }
}

function program(): LoadedProgram {
  return {
    name: 'Parameter test',
    author: 'Test',
    inputCount: 2,
    outputCount: 1,
    inputNames: ['Pitch', 'Gate'],
    outputNames: ['Envelope'],
    inputKinds: ['cv', 'gate'],
    outputKinds: ['linear'],
    parameters: [parameter('Amount', 4), parameter('Fine', 0.25, 100)],
    parameterPresets: [],
    customUi: false,
    uiPotPositions: [null, null, null],
  }
}

describe('LuaScriptParameterModel', () => {
  it('places script parameters after the fixed firmware-wide namespace', () => {
    const model = new LuaScriptParameterModel(program())

    expect(LUA_SCRIPT_PARAMETER_OFFSET).toBe(85)
    expect(model.parameterOffset).toBe(85)
    expect(model.count).toBe(87)
    expect(model.defaultParameterIndex).toBe(86)
    expect(model.info(1)?.definition.name).toBe('Program')
    expect(model.info(2)).toMatchObject({ definition: { name: 'Pitch' }, value: 1 })
    expect(model.info(29)).toMatchObject({ definition: { name: 'Input 28' }, value: 28 })
    expect(model.info(30)).toMatchObject({ definition: { name: 'Envelope' }, value: 15 })
    expect(model.info(31)).toMatchObject({
      definition: {
        name: 'Envelope mode',
        enumValues: ['Add', 'Replace'],
        enumOffset: 0,
      },
      value: 0,
    })
    expect(model.info(85)?.definition.name).toBe('Output 28 mode')
    expect(model.info(86)).toMatchObject({
      definition: { name: 'Amount' },
      value: 4,
      scriptIndex: 0,
    })
  })

  it('finds, reads, and updates system and script parameters by global index', () => {
    const model = new LuaScriptParameterModel(program())

    expect(model.findParameters('Program')).toEqual([1])
    expect(model.findParameters('Pitch')).toEqual([2])
    expect(model.findParameters('Envelope mode')).toEqual([31])
    expect(model.findParameters('Amount')).toEqual([86])
    expect(model.findParameters('Missing')).toBeUndefined()

    expect(model.set(2, 12.7)).toMatchObject({ value: 13 })
    expect(model.set(31, 0.8)).toMatchObject({ value: 1 })
    expect(model.set(86, 4.6)).toMatchObject({ value: 5, scriptIndex: 0 })
    expect(model.setNormalized(87, 0.126)).toMatchObject({
      value: 1.26,
      scriptIndex: 1,
    })
    expect(model.scriptValues()).toEqual([5, 1.26])
  })

  it('quantizes unscaled, scaled, and enum values after clamping', () => {
    expect(quantizeParameterValue(parameter('Integer', 0), 1.6)).toBe(2)
    expect(quantizeParameterValue(parameter('Scaled', 0, 10), 1.26)).toBe(1.3)
    expect(quantizeParameterValue({
      ...parameter('Mode', 1),
      min: 1,
      max: 3,
      enumValues: ['A', 'B', 'C'],
    }, 2.6)).toBe(3)
    expect(quantizeParameterValue(parameter('Clamped', 0), 20)).toBe(10)
  })

  it('uses Program as the default when a script declares no parameters', () => {
    const metadata = program()
    metadata.parameters = []
    const model = new LuaScriptParameterModel(metadata)

    expect(model.count).toBe(85)
    expect(model.defaultParameterIndex).toBe(1)
    expect(model.scriptValues()).toEqual([])
  })

  it('applies a complete script-relative vector atomically', () => {
    const model = new LuaScriptParameterModel(program())

    expect(model.setScriptValues([4.6, 1.267])).toEqual([5, 1.27])
    expect(model.scriptValues()).toEqual([5, 1.27])
    expect(model.info(1)?.value).toBe(0)

    expect(model.setScriptValues([8])).toBeUndefined()
    expect(model.setScriptValues([8, Number.NaN])).toBeUndefined()
    expect(model.setScriptValues([12, 1])).toBeUndefined()
    expect(model.scriptValues()).toEqual([5, 1.27])
  })
})
