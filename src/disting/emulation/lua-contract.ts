import type {
  InputKind,
  LoadedProgram,
  OutputKind,
  ParameterDefinition,
} from '../types'
import { DISTING_CONSTANT_VALUES } from '../validation/api-manifest'

export type LuaProgram = {
  [key: string]: unknown
  name?: string
  author?: string
  algorithmIndex?: number
  parameterOffset?: number
  parameters?: unknown[]
  luading?: unknown
  init?: (self: LuaProgram) => LuaInitResult | undefined
  step?: (self: LuaProgram, dt: number, inputs: number[]) => number[] | undefined
  trigger?: (self: LuaProgram, input: number) => number[] | undefined
  gate?: (self: LuaProgram, input: number, rising: boolean) => number[] | undefined
  draw?: (self: LuaProgram) => unknown
  ui?: (self: LuaProgram) => unknown
  setupUi?: (self: LuaProgram) => unknown
  midiMessage?: (self: LuaProgram, message: number[]) => unknown
  serialise?: (self: LuaProgram) => unknown
  state?: unknown
}

export type LuaProgramRuntime = {
  program: LuaProgram
  configure: (algorithmIndex: number, parameterOffset: number) => void
  setParameters: (parameters: number[]) => void
  setParameter: (index: number, value: number) => void
  init?: () => LuaInitResult | undefined
  step?: (dt: number, inputs: number[]) => number[] | undefined
  trigger?: (input: number) => number[] | undefined
  gate?: (input: number, rising: boolean) => number[] | undefined
  draw?: () => unknown
  ui?: () => unknown
  setupUi?: () => unknown
  midiMessage?: (message: number[]) => unknown
  serialise?: () => unknown
  setState: (state: unknown) => void
  callUi: (callback: string, value?: number) => unknown
  close?: () => void
}

export type LuaInitResult = {
  inputs?: unknown
  outputs?: unknown
  inputNames?: unknown
  outputNames?: unknown
  parameters?: unknown
  midi?: unknown
}

export const DISTING_CONSTANTS = DISTING_CONSTANT_VALUES

function numeric(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function luaSequence(value: unknown) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return undefined

  if (Object.keys(value).length === 0) return []
  const entries = Object.entries(value)
    .map(([key, entry]) => [Number(key), entry] as const)
    .filter(([key]) => Number.isInteger(key) && key >= 1)
  if (entries.length === 0) return undefined

  const result: unknown[] = []
  for (const [key, entry] of entries) result[key - 1] = entry
  return result
}

function resolveEntries(value: unknown) {
  const entries = luaSequence(value)
  if (entries) return entries
  return Array.from({ length: Math.max(0, Math.floor(numeric(value))) }, () => 0)
}

function inputKind(value: unknown): InputKind {
  if (numeric(value) === DISTING_CONSTANTS.kGate) return 'gate'
  if (numeric(value) === DISTING_CONSTANTS.kTrigger) return 'trigger'
  return 'cv'
}

function outputKind(value: unknown): OutputKind {
  return numeric(value) === DISTING_CONSTANTS.kLinear ? 'linear' : 'stepped'
}

function parameterUnit(unit: unknown) {
  const names: Record<number, string> = {
    0: '',
    1: 'dB',
    2: '%',
    3: 'Hz',
    4: 'st',
    5: 'ct',
    6: 'ms',
    7: 's',
    8: 'frames',
    9: 'MIDI',
    10: 'mV',
    11: 'V',
    12: 'BPM',
    13: 'dB',
  }
  return names[numeric(unit)] ?? ''
}

function parseParameters(raw: unknown): ParameterDefinition[] {
  const parameters = luaSequence(raw)
  if (!parameters) return []

  return parameters.map((rawDefinition, index) => {
    const definition = luaSequence(rawDefinition) ?? []
    const name = typeof definition[0] === 'string' ? definition[0] : `Parameter ${index + 1}`
    const rawEnumValues = luaSequence(definition[1])
    if (rawEnumValues) {
      const enumValues = rawEnumValues.map(String)
      return {
        name,
        min: 1,
        max: enumValues.length,
        value: Math.max(1, numeric(definition[2], 1)),
        unit: '',
        scale: 1,
        enumValues,
      }
    }

    const scale = numeric(definition[5], 1) || 1
    return {
      name,
      min: numeric(definition[1]) / scale,
      max: numeric(definition[2], 100) / scale,
      value: numeric(definition[3]) / scale,
      unit: parameterUnit(definition[4]),
      scale,
    }
  })
}

export function describeProgram(program: LuaProgram, init: LuaInitResult): LoadedProgram {
  const inputEntries = resolveEntries(init.inputs)
  const outputEntries = resolveEntries(init.outputs)
  const inputNames = luaSequence(init.inputNames)
  const outputNames = luaSequence(init.outputNames)
  const midi = init.midi && typeof init.midi === 'object'
    ? init.midi as { channelParameter?: unknown; messages?: unknown }
    : undefined
  const midiMessages = luaSequence(midi?.messages)

  return {
    name: program.name ?? 'Untitled Lua Script',
    author: program.author ?? 'Unknown author',
    inputCount: inputEntries.length,
    outputCount: outputEntries.length,
    inputNames: inputEntries.map((_, index) => (
      typeof inputNames?.[index] === 'string' ? inputNames[index] : `Input ${index + 1}`
    )),
    outputNames: outputEntries.map((_, index) => (
      typeof outputNames?.[index] === 'string' ? outputNames[index] : `Output ${index + 1}`
    )),
    inputKinds: inputEntries.map(inputKind),
    outputKinds: outputEntries.map(outputKind),
    parameters: parseParameters(init.parameters),
    parameterPresets: [],
    customUi: false,
    uiPotPositions: [null, null, null],
    midi: midi
      ? {
          channelParameter: typeof midi.channelParameter === 'number'
            ? Math.trunc(midi.channelParameter)
            : undefined,
          messages: midiMessages?.map(String) ?? [],
        }
      : undefined,
  }
}
