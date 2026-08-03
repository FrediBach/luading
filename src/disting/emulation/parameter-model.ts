import type {
  LoadedProgram,
  ParameterDefinition,
} from '../types'

export const DISTING_BUS_COUNT = 28
export const LUA_SCRIPT_PROGRAM_PARAMETER_COUNT = 1
export const LUA_SCRIPT_INPUT_PARAMETER_COUNT = DISTING_BUS_COUNT
export const LUA_SCRIPT_OUTPUT_PARAMETER_COUNT = DISTING_BUS_COUNT * 2
// Firmware presets reserve Program, 28 input routes, and 28 output bus/mode
// pairs before the values declared by a Lua script.
export const LUA_SCRIPT_PARAMETER_OFFSET =
  LUA_SCRIPT_PROGRAM_PARAMETER_COUNT
  + LUA_SCRIPT_INPUT_PARAMETER_COUNT
  + LUA_SCRIPT_OUTPUT_PARAMETER_COUNT

export type AlgorithmParameterInfo = {
  definition: ParameterDefinition
  value: number
  scriptIndex?: number
}

function numericParameter(
  name: string,
  min: number,
  max: number,
  value: number,
): ParameterDefinition {
  return {
    name,
    min,
    max,
    value,
    unit: '',
    scale: 1,
  }
}

function outputBus(index: number) {
  return (14 + index) % DISTING_BUS_COUNT + 1
}

function systemParameters(program: LoadedProgram): ParameterDefinition[] {
  const definitions = [numericParameter('Program', 0, 999, 0)]

  for (let index = 0; index < DISTING_BUS_COUNT; index += 1) {
    definitions.push(numericParameter(
      program.inputNames[index] ?? `Input ${index + 1}`,
      1,
      DISTING_BUS_COUNT,
      index + 1,
    ))
  }

  for (let index = 0; index < DISTING_BUS_COUNT; index += 1) {
    const name = program.outputNames[index] ?? `Output ${index + 1}`
    definitions.push(
      numericParameter(name, 1, DISTING_BUS_COUNT, outputBus(index)),
      {
        ...numericParameter(`${name} mode`, 0, 1, 0),
        enumValues: ['Add', 'Replace'],
        enumOffset: 0,
      },
    )
  }

  return definitions
}

export function quantizeParameterValue(
  definition: ParameterDefinition,
  value: number,
) {
  const clamped = Math.min(definition.max, Math.max(definition.min, value))
  if (definition.enumValues) return Math.round(clamped)
  const scale = Number.isFinite(definition.scale) && definition.scale > 0
    ? definition.scale
    : 1
  return Math.round(clamped * scale) / scale
}

export class LuaScriptParameterModel {
  private readonly parameters: AlgorithmParameterInfo[]

  constructor(program: LoadedProgram) {
    const system = systemParameters(program).map((definition) => ({
      definition,
      value: definition.value,
    }))
    const script = program.parameters.map((definition, scriptIndex) => ({
      definition,
      value: definition.value,
      scriptIndex,
    }))
    this.parameters = [...system, ...script]
  }

  get parameterOffset() {
    return LUA_SCRIPT_PARAMETER_OFFSET
  }

  get count() {
    return this.parameters.length
  }

  get defaultParameterIndex() {
    return this.count > this.parameterOffset ? this.parameterOffset + 1 : 1
  }

  info(parameterIndex: unknown): AlgorithmParameterInfo | undefined {
    if (
      typeof parameterIndex !== 'number'
      || !Number.isFinite(parameterIndex)
    ) return undefined
    return this.parameters[Math.trunc(parameterIndex) - 1]
  }

  findParameters(name: unknown) {
    if (typeof name !== 'string') return undefined
    const matches = this.parameters.flatMap((parameter, index) => (
      parameter.definition.name === name ? [index + 1] : []
    ))
    return matches.length > 0 ? matches : undefined
  }

  set(parameterIndex: unknown, value: unknown) {
    const parameter = this.info(parameterIndex)
    if (!parameter || typeof value !== 'number' || !Number.isFinite(value)) {
      return undefined
    }
    parameter.value = quantizeParameterValue(parameter.definition, value)
    return parameter
  }

  setNormalized(parameterIndex: unknown, value: unknown) {
    const parameter = this.info(parameterIndex)
    if (!parameter || typeof value !== 'number' || !Number.isFinite(value)) {
      return undefined
    }
    const normalized = Math.min(1, Math.max(0, value))
    return this.set(
      parameterIndex,
      parameter.definition.min
        + normalized * (parameter.definition.max - parameter.definition.min),
    )
  }

  scriptValues() {
    return this.parameters
      .slice(this.parameterOffset)
      .map((parameter) => parameter.value)
  }

  setScriptValues(values: readonly number[]) {
    const scriptParameters = this.parameters.slice(this.parameterOffset)
    if (values.length !== scriptParameters.length) return undefined

    const valid = values.every((value, index) => {
      const definition = scriptParameters[index]?.definition
      return definition
        && typeof value === 'number'
        && Number.isFinite(value)
        && value >= definition.min
        && value <= definition.max
        && (!definition.enumValues || Number.isInteger(value))
    })
    if (!valid) return undefined

    const canonical = values.map((value, index) => (
      quantizeParameterValue(scriptParameters[index].definition, value)
    ))
    canonical.forEach((value, index) => {
      scriptParameters[index].value = value
    })
    return [...canonical]
  }
}
