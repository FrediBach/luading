import type {
  ParameterDefinition,
  ScriptParameterPreset,
} from '../types'
import type { ScriptDiagnostic } from '../validation/types'
import { quantizeParameterValue } from './parameter-model'

export interface ParameterPresetResult {
  presets: ScriptParameterPreset[]
  diagnostics: ScriptDiagnostic[]
}

function luaSequence(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return undefined

  const keys = Object.keys(value)
  if (keys.length === 0) return []
  const entries = Object.entries(value)
    .map(([key, entry]) => [Number(key), entry] as const)
    .filter(([key]) => Number.isInteger(key) && key >= 1)
  if (entries.length !== keys.length || entries.length === 0) return undefined

  const result: unknown[] = []
  for (const [key, entry] of entries) result[key - 1] = entry
  return result
}

function diagnostic(
  ruleId: string,
  message: string,
  detail: string,
  suggestion: string,
  semanticLocation: string,
): ScriptDiagnostic {
  return {
    id: `contract:${ruleId}`,
    ruleId,
    severity: 'warning',
    category: 'contract',
    target: 'simulator',
    origin: 'contract',
    message,
    detail,
    suggestion,
    penalty: 0,
    semanticLocation,
  }
}

function presetLocation(index: number) {
  return `topLevel:luading.parameterPresets[${index + 1}]`
}

function parsePreset(
  raw: unknown,
  index: number,
  definitions: readonly ParameterDefinition[],
  names: Set<string>,
  diagnostics: ScriptDiagnostic[],
): ScriptParameterPreset | undefined {
  const location = presetLocation(index)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    diagnostics.push(diagnostic(
      `parameter-preset-${index + 1}-shape`,
      `Parameter preset ${index + 1} must be a table`,
      'Each Luading parameter preset needs named name and values fields.',
      'Use { name = "Preset name", values = { ... } }.',
      location,
    ))
    return undefined
  }

  const candidate = raw as { name?: unknown; values?: unknown }
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
  if (!name) {
    diagnostics.push(diagnostic(
      `parameter-preset-${index + 1}-name`,
      `Parameter preset ${index + 1} needs a name`,
      'The name field must be a non-empty string.',
      'Add a short unique name for the preset.',
      `${location}.name`,
    ))
    return undefined
  }
  if (names.has(name)) {
    diagnostics.push(diagnostic(
      `parameter-preset-${index + 1}-duplicate-name`,
      `Parameter preset name "${name}" is duplicated`,
      'Preset names must be unique so the selector remains unambiguous.',
      'Rename this preset.',
      `${location}.name`,
    ))
    return undefined
  }

  const values = luaSequence(candidate.values)
  if (!values) {
    diagnostics.push(diagnostic(
      `parameter-preset-${index + 1}-values-shape`,
      `Parameter preset "${name}" needs a values sequence`,
      'The values field must be a 1-based Lua sequence.',
      'Use values = { value1, value2, ... } in parameter order.',
      `${location}.values`,
    ))
    return undefined
  }
  if (definitions.length === 0) {
    diagnostics.push(diagnostic(
      `parameter-preset-${index + 1}-no-parameters`,
      `Parameter preset "${name}" has no parameters to set`,
      'The script does not declare any init().parameters entries.',
      'Remove the preset or declare script parameters.',
      location,
    ))
    return undefined
  }
  if (values.length !== definitions.length) {
    diagnostics.push(diagnostic(
      `parameter-preset-${index + 1}-count`,
      `Parameter preset "${name}" has ${values.length} values instead of ${definitions.length}`,
      'Version-one presets must provide one value for every script parameter.',
      'Add or remove values so the sequence matches init().parameters exactly.',
      `${location}.values`,
    ))
    return undefined
  }

  const canonical: number[] = []
  for (let valueIndex = 0; valueIndex < definitions.length; valueIndex += 1) {
    const value = values[valueIndex]
    const definition = definitions[valueIndex]
    const valueLocation = `${location}.values[${valueIndex + 1}]`
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      diagnostics.push(diagnostic(
        `parameter-preset-${index + 1}-value-${valueIndex + 1}-number`,
        `Parameter preset "${name}" has a non-finite value for ${definition.name}`,
        'Preset values must be finite numbers in script-visible scaled units.',
        'Replace this value with a finite number.',
        valueLocation,
      ))
      return undefined
    }
    if (value < definition.min || value > definition.max) {
      diagnostics.push(diagnostic(
        `parameter-preset-${index + 1}-value-${valueIndex + 1}-range`,
        `Parameter preset "${name}" is outside the range for ${definition.name}`,
        `Received ${value}; the scaled range is ${definition.min} to ${definition.max}.`,
        'Choose a value inside the declared parameter range.',
        valueLocation,
      ))
      return undefined
    }
    if (definition.enumValues && !Number.isInteger(value)) {
      diagnostics.push(diagnostic(
        `parameter-preset-${index + 1}-value-${valueIndex + 1}-enum`,
        `Parameter preset "${name}" has a non-integer enum value for ${definition.name}`,
        `Enum values use 1-based integer indices from 1 to ${definition.enumValues.length}.`,
        'Use the integer index of the desired enum option.',
        valueLocation,
      ))
      return undefined
    }
    canonical.push(quantizeParameterValue(definition, value))
  }

  names.add(name)
  return { name, values: canonical }
}

export function parseParameterPresets(
  rawLuading: unknown,
  definitions: readonly ParameterDefinition[],
): ParameterPresetResult {
  if (rawLuading === undefined) return { presets: [], diagnostics: [] }

  if (!rawLuading || typeof rawLuading !== 'object' || Array.isArray(rawLuading)) {
    return {
      presets: [],
      diagnostics: [diagnostic(
        'luading-shape',
        'luading must be a configuration table',
        'Luading-only script metadata uses named fields in a table.',
        'Use luading = { parameterPresets = { ... } }.',
        'topLevel:luading',
      )],
    }
  }

  const rawPresets = (rawLuading as { parameterPresets?: unknown }).parameterPresets
  if (rawPresets === undefined) return { presets: [], diagnostics: [] }
  const entries = luaSequence(rawPresets)
  if (!entries) {
    return {
      presets: [],
      diagnostics: [diagnostic(
        'parameter-presets-shape',
        'luading.parameterPresets must be a sequence',
        'Parameter presets are displayed in their 1-based Lua sequence order.',
        'Use parameterPresets = { { name = "Name", values = { ... } } }.',
        'topLevel:luading.parameterPresets',
      )],
    }
  }

  const diagnostics: ScriptDiagnostic[] = []
  const names = new Set<string>()
  const presets = entries.flatMap((entry, index) => {
    const preset = parsePreset(entry, index, definitions, names, diagnostics)
    return preset ? [preset] : []
  })
  return { presets, diagnostics }
}

export function matchingParameterPresetIndex(
  presets: readonly ScriptParameterPreset[],
  values: readonly number[],
) {
  const index = presets.findIndex((preset) => (
    preset.values.length === values.length
    && preset.values.every((value, valueIndex) => value === values[valueIndex])
  ))
  return index >= 0 ? index : null
}
