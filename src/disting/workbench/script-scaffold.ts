import type {
  DistingContractProvenance,
  DistingLifecycleName,
} from '../validation/api-manifest'
import {
  DISTING_CONSTANTS,
  DISTING_LIFECYCLE_BY_NAME,
} from '../validation/api-manifest'
import { luaDownloadFilename } from './script-file'

export type ScaffoldInputKind = 'cv' | 'gate' | 'trigger'
export type ScaffoldOutputKind = 'linear' | 'stepped'
export type ScaffoldPrecision = 1 | 10 | 100 | 1000
export type ScaffoldDisplay = 'standard' | 'custom-with-parameter-line' | 'custom-full'
export type ScaffoldMidiMessage =
  | 'note'
  | 'cc'
  | 'bend'
  | 'aftertouch'
  | 'poly pressure'
  | 'program change'

export type DistingParameterUnitName =
  | 'kNone'
  | 'kDb'
  | 'kDb_minInf'
  | 'kPercent'
  | 'kHz'
  | 'kSemitones'
  | 'kCents'
  | 'kMs'
  | 'kSeconds'
  | 'kFrames'
  | 'kMIDINote'
  | 'kMillivolts'
  | 'kVolts'
  | 'kBPM'

export interface ScaffoldInput {
  id: string
  name: string
  kind: ScaffoldInputKind
}

export interface ScaffoldOutput {
  id: string
  name: string
  kind: ScaffoldOutputKind
}

export interface ScaffoldNumericParameter {
  id: string
  kind: 'numeric'
  name: string
  minimum: number
  maximum: number
  defaultValue: number
  unit: DistingParameterUnitName
  precision: ScaffoldPrecision
}

export interface ScaffoldChoice {
  id: string
  label: string
}

export interface ScaffoldChoiceParameter {
  id: string
  kind: 'choice'
  name: string
  choices: ScaffoldChoice[]
  defaultChoiceId: string
}

export type ScaffoldParameter = ScaffoldNumericParameter | ScaffoldChoiceParameter

export type ScaffoldControlCallback = Exclude<
  DistingLifecycleName,
  'init' | 'step' | 'trigger' | 'gate' | 'draw' | 'ui' | 'setupUi' | 'midiMessage' | 'serialise'
>

export interface ScaffoldParameterPreset {
  id: string
  name: string
  valuesByParameterId: Record<string, number>
}

export interface ScriptScaffoldDraft {
  version: 1
  scriptKind: 'algorithm'
  name: string
  description: string
  author: string
  inputs: ScaffoldInput[]
  outputs: ScaffoldOutput[]
  parameters: ScaffoldParameter[]
  controls: {
    customUi: boolean
    callbacks: ScaffoldControlCallback[]
    allowSimulatorExtensions: boolean
  }
  extras: {
    display: ScaffoldDisplay
    midi?: {
      parameterId: string
      messages: ScaffoldMidiMessage[]
    }
    serialise: boolean
    parameterPresets: ScaffoldParameterPreset[]
  }
}

export type ScaffoldStep = 'basics' | 'inputs' | 'outputs' | 'parameters' | 'controls' | 'extras'

export interface ScaffoldFinding {
  code: string
  severity: 'error' | 'info'
  step: ScaffoldStep
  message: string
  entityId?: string
  field?: string
}

export interface ScaffoldSummary {
  inputCount: number
  outputCount: number
  parameterCount: number
  callbacks: string[]
  hardwareFeatures: string[]
  simulatorExtensions: string[]
}

export type ScriptScaffoldResult =
  | {
      ok: true
      draft: ScriptScaffoldDraft
      filename: string
      source: string
      summary: ScaffoldSummary
    }
  | {
      ok: false
      draft: ScriptScaffoldDraft
      findings: ScaffoldFinding[]
    }

const DEFAULT_NAME = 'New Script'
const DEFAULT_DESCRIPTION = 'Passes input 1 to output 1. Replace the example logic below.'
const DEFAULT_AUTHOR = 'Your Name'

export const PARAMETER_UNITS: readonly {
  name: DistingParameterUnitName
  label: string
}[] = [
  { name: 'kNone', label: 'None' },
  { name: 'kDb', label: 'dB' },
  { name: 'kDb_minInf', label: 'dB (−∞ minimum)' },
  { name: 'kPercent', label: 'Percent' },
  { name: 'kHz', label: 'Hz' },
  { name: 'kSemitones', label: 'Semitones' },
  { name: 'kCents', label: 'Cents' },
  { name: 'kMs', label: 'Milliseconds' },
  { name: 'kSeconds', label: 'Seconds' },
  { name: 'kFrames', label: 'Frames' },
  { name: 'kMIDINote', label: 'MIDI note' },
  { name: 'kMillivolts', label: 'Millivolts' },
  { name: 'kVolts', label: 'Volts' },
  { name: 'kBPM', label: 'BPM' },
]

export const MIDI_MESSAGE_OPTIONS: readonly ScaffoldMidiMessage[] = [
  'note',
  'cc',
  'bend',
  'aftertouch',
  'poly pressure',
  'program change',
]

const CONTROL_CALLBACK_NAMES: readonly ScaffoldControlCallback[] = [
  'pot1Turn', 'pot2Turn', 'pot3Turn',
  'encoder1Turn', 'encoder2Turn',
  'pot1Push', 'pot1Release',
  'pot2Push', 'pot2Release',
  'pot3Push', 'pot3Release',
  'encoder1Push', 'encoder1Release',
  'encoder2Push', 'encoder2Release',
  'button1Push', 'button1Release',
  'button2Push', 'button2Release',
  'button3Push', 'button3Release',
  'button4Push', 'button4Release',
]

export interface ScaffoldControlOption {
  callback: ScaffoldControlCallback
  label: string
  control: string
  event: 'turn' | 'push' | 'release'
  provenance: DistingContractProvenance
}

function controlLabel(callback: ScaffoldControlCallback) {
  const match = callback.match(/^(pot|encoder|button)(\d)(Turn|Push|Release)$/)
  if (!match) return callback
  const [, kind, number, event] = match
  const control = `${kind[0].toUpperCase()}${kind.slice(1)} ${number}`
  return `${control} ${event.toLowerCase()}`
}

export const SCAFFOLD_CONTROL_OPTIONS: readonly ScaffoldControlOption[] = CONTROL_CALLBACK_NAMES.map((callback) => {
  const lifecycle = DISTING_LIFECYCLE_BY_NAME.get(callback)
  const match = callback.match(/^(pot|encoder|button)(\d)(Turn|Push|Release)$/)
  if (!lifecycle || !match) throw new Error(`Scaffold callback ${callback} is absent from the API manifest.`)
  return {
    callback,
    label: controlLabel(callback),
    control: `${match[1]}${match[2]}`,
    event: match[3].toLowerCase() as 'turn' | 'push' | 'release',
    provenance: lifecycle.provenance,
  }
})

const CONTROL_OPTION_BY_NAME = new Map(
  SCAFFOLD_CONTROL_OPTIONS.map((option) => [option.callback, option]),
)
const UNIT_NAMES = new Set(PARAMETER_UNITS.map(({ name }) => name))
const MIDI_MESSAGES = new Set<ScaffoldMidiMessage>(MIDI_MESSAGE_OPTIONS)

export function createDefaultScriptScaffold(): ScriptScaffoldDraft {
  return {
    version: 1,
    scriptKind: 'algorithm',
    name: DEFAULT_NAME,
    description: DEFAULT_DESCRIPTION,
    author: DEFAULT_AUTHOR,
    inputs: [{ id: 'input-1', name: 'Input', kind: 'cv' }],
    outputs: [{ id: 'output-1', name: 'Output', kind: 'linear' }],
    parameters: [],
    controls: {
      customUi: false,
      callbacks: [],
      allowSimulatorExtensions: false,
    },
    extras: {
      display: 'standard',
      serialise: false,
      parameterPresets: [],
    },
  }
}

export function createScaffoldInput(index: number, id: string): ScaffoldInput {
  return { id, name: `Input ${index}`, kind: 'cv' }
}

export function createScaffoldOutput(index: number, id: string): ScaffoldOutput {
  return { id, name: `Output ${index}`, kind: 'linear' }
}

export function createNumericScaffoldParameter(index: number, id: string): ScaffoldNumericParameter {
  return {
    id,
    kind: 'numeric',
    name: `Parameter ${index}`,
    minimum: 0,
    maximum: 100,
    defaultValue: 50,
    unit: 'kPercent',
    precision: 1,
  }
}

export function createChoiceScaffoldParameter(index: number, id: string): ScaffoldChoiceParameter {
  const offId = `${id}-choice-off`
  return {
    id,
    kind: 'choice',
    name: `Parameter ${index}`,
    choices: [
      { id: offId, label: 'Off' },
      { id: `${id}-choice-on`, label: 'On' },
    ],
    defaultChoiceId: offId,
  }
}

function defaultParameterValue(parameter: ScaffoldParameter) {
  if (parameter.kind === 'numeric') return parameter.defaultValue
  return Math.max(1, parameter.choices.findIndex(({ id }) => id === parameter.defaultChoiceId) + 1)
}

export function createScaffoldParameterPreset(
  draft: ScriptScaffoldDraft,
  id: string,
  name = `Preset ${draft.extras.parameterPresets.length + 1}`,
): ScaffoldParameterPreset {
  return {
    id,
    name,
    valuesByParameterId: Object.fromEntries(
      draft.parameters.map((parameter) => [parameter.id, defaultParameterValue(parameter)]),
    ),
  }
}

export function createMidiChannelParameter(id: string): ScaffoldNumericParameter {
  return {
    id,
    kind: 'numeric',
    name: 'MIDI Channel',
    minimum: 0,
    maximum: 16,
    defaultValue: 0,
    unit: 'kNone',
    precision: 1,
  }
}

function oneLine(value: string) {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function cloneParameter(parameter: ScaffoldParameter): ScaffoldParameter {
  return parameter.kind === 'numeric'
    ? { ...parameter }
    : { ...parameter, choices: parameter.choices.map((choice) => ({ ...choice })) }
}

export function normalizeScriptScaffold(draft: ScriptScaffoldDraft): ScriptScaffoldDraft {
  return {
    ...draft,
    version: 1,
    scriptKind: 'algorithm',
    name: oneLine(draft.name) || DEFAULT_NAME,
    description: oneLine(draft.description) || DEFAULT_DESCRIPTION,
    author: oneLine(draft.author) || DEFAULT_AUTHOR,
    inputs: draft.inputs.map((input) => ({ ...input, name: input.name.trim() })),
    outputs: draft.outputs.map((output) => ({ ...output, name: output.name.trim() })),
    parameters: draft.parameters.map((parameter) => {
      const cloned = cloneParameter(parameter)
      cloned.name = cloned.name.trim()
      if (cloned.kind === 'choice') {
        cloned.choices = cloned.choices.map((choice) => ({ ...choice, label: choice.label.trim() }))
      }
      return cloned
    }),
    controls: {
      ...draft.controls,
      callbacks: [...new Set(draft.controls.callbacks)],
    },
    extras: {
      ...draft.extras,
      ...(draft.extras.midi
        ? { midi: { ...draft.extras.midi, messages: [...new Set(draft.extras.midi.messages)] } }
        : { midi: undefined }),
      parameterPresets: draft.extras.parameterPresets.map((preset) => ({
        ...preset,
        name: preset.name.trim(),
        valuesByParameterId: { ...preset.valuesByParameterId },
      })),
    },
  }
}

function exactRawValue(value: number, precision: ScaffoldPrecision) {
  const scaled = value * precision
  return Number.isFinite(scaled) && Math.abs(scaled - Math.round(scaled)) < 1e-9
}

function addFinding(
  findings: ScaffoldFinding[],
  code: string,
  step: ScaffoldStep,
  message: string,
  entityId?: string,
  field?: string,
) {
  findings.push({
    code,
    severity: 'error',
    step,
    message,
    ...(entityId ? { entityId } : {}),
    ...(field ? { field } : {}),
  })
}

function validateNumericParameter(
  parameter: ScaffoldNumericParameter,
  findings: ScaffoldFinding[],
) {
  const values = [parameter.minimum, parameter.maximum, parameter.defaultValue]
  if (!values.every((value) => Number.isFinite(value))) {
    addFinding(findings, 'parameter-number', 'parameters', `${parameter.name || 'Numeric parameter'} needs finite range values.`, parameter.id, 'minimum')
    return
  }
  if (!values.every((value) => exactRawValue(value, parameter.precision))) {
    addFinding(findings, 'parameter-precision', 'parameters', `${parameter.name || 'Numeric parameter'} has a value that cannot be represented at its selected precision.`, parameter.id, 'precision')
  }
  if (parameter.minimum > parameter.maximum) {
    addFinding(findings, 'parameter-range', 'parameters', `${parameter.name || 'Numeric parameter'} has a minimum greater than its maximum.`, parameter.id, 'minimum')
  }
  if (parameter.defaultValue < parameter.minimum || parameter.defaultValue > parameter.maximum) {
    addFinding(findings, 'parameter-default', 'parameters', `${parameter.name || 'Numeric parameter'} has a default outside its range.`, parameter.id, 'defaultValue')
  }
  if (!UNIT_NAMES.has(parameter.unit)) {
    addFinding(findings, 'parameter-unit', 'parameters', `${parameter.name || 'Numeric parameter'} uses an unknown unit.`, parameter.id, 'unit')
  }
  if (![1, 10, 100, 1000].includes(parameter.precision)) {
    addFinding(findings, 'parameter-scale', 'parameters', `${parameter.name || 'Numeric parameter'} uses an unknown precision.`, parameter.id, 'precision')
  }
}

function validatePresetValue(
  parameter: ScaffoldParameter,
  value: number | undefined,
  findings: ScaffoldFinding[],
  preset: ScaffoldParameterPreset,
) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    addFinding(findings, 'preset-value', 'extras', `${preset.name || 'Preset'} needs a value for ${parameter.name}.`, preset.id, parameter.id)
    return
  }
  if (parameter.kind === 'choice') {
    if (!Number.isInteger(value) || value < 1 || value > parameter.choices.length) {
      addFinding(findings, 'preset-choice', 'extras', `${preset.name || 'Preset'} has an invalid choice for ${parameter.name}.`, preset.id, parameter.id)
    }
    return
  }
  if (value < parameter.minimum || value > parameter.maximum || !exactRawValue(value, parameter.precision)) {
    addFinding(findings, 'preset-number', 'extras', `${preset.name || 'Preset'} has an invalid value for ${parameter.name}.`, preset.id, parameter.id)
  }
}

export function validateScriptScaffold(draft: ScriptScaffoldDraft): ScaffoldFinding[] {
  const findings: ScaffoldFinding[] = []
  if (draft.inputs.length > 28) addFinding(findings, 'input-count', 'inputs', 'A Disting NT algorithm can declare at most 28 inputs.')
  if (draft.outputs.length > 28) addFinding(findings, 'output-count', 'outputs', 'A Disting NT algorithm can declare at most 28 outputs.')

  draft.inputs.forEach((input) => {
    if (!input.name) addFinding(findings, 'input-name', 'inputs', 'Each input needs a name.', input.id, 'name')
    if (!['cv', 'gate', 'trigger'].includes(input.kind)) addFinding(findings, 'input-kind', 'inputs', `${input.name || 'Input'} has an unknown type.`, input.id, 'kind')
  })
  draft.outputs.forEach((output) => {
    if (!output.name) addFinding(findings, 'output-name', 'outputs', 'Each output needs a name.', output.id, 'name')
    if (!['linear', 'stepped'].includes(output.kind)) addFinding(findings, 'output-kind', 'outputs', `${output.name || 'Output'} has an unknown mode.`, output.id, 'kind')
  })

  const parameterIds = new Set<string>()
  draft.parameters.forEach((parameter) => {
    parameterIds.add(parameter.id)
    if (!parameter.name) addFinding(findings, 'parameter-name', 'parameters', 'Each parameter needs a name.', parameter.id, 'name')
    if (parameter.kind === 'numeric') {
      validateNumericParameter(parameter, findings)
      return
    }
    if (parameter.choices.length === 0) {
      addFinding(findings, 'parameter-choices', 'parameters', `${parameter.name || 'Choice parameter'} needs at least one choice.`, parameter.id, 'choices')
    }
    parameter.choices.forEach((choice) => {
      if (!choice.label) addFinding(findings, 'parameter-choice-label', 'parameters', `${parameter.name || 'Choice parameter'} has an empty choice.`, parameter.id, choice.id)
    })
    if (!parameter.choices.some(({ id }) => id === parameter.defaultChoiceId)) {
      addFinding(findings, 'parameter-choice-default', 'parameters', `${parameter.name || 'Choice parameter'} needs a valid default choice.`, parameter.id, 'defaultChoiceId')
    }
  })

  draft.controls.callbacks.forEach((callback) => {
    const option = CONTROL_OPTION_BY_NAME.get(callback)
    if (!option) {
      addFinding(findings, 'control-callback', 'controls', `${callback} is not a supported scaffold callback.`)
    } else if (option.provenance !== 'manual-1.12' && !draft.controls.allowSimulatorExtensions) {
      addFinding(findings, 'control-provenance', 'controls', `${option.label} needs explicit non-manual control consent.`, callback)
    }
  })
  if (!draft.controls.customUi && draft.controls.callbacks.length > 0) {
    addFinding(findings, 'control-custom-ui', 'controls', 'Enable custom algorithm UI before selecting control callbacks.')
  }

  const midi = draft.extras.midi
  if (midi) {
    const parameter = draft.parameters.find((entry) => entry.id === midi.parameterId)
    const compatible = parameter?.kind === 'numeric'
      && parameter.precision === 1
      && parameter.minimum <= 0
      && parameter.maximum >= 16
    if (!compatible) {
      addFinding(findings, 'midi-parameter', 'extras', 'MIDI needs a whole-number channel parameter spanning 0 through 16.', midi.parameterId, 'midiParameter')
    }
    if (midi.messages.length === 0 || midi.messages.some((message) => !MIDI_MESSAGES.has(message))) {
      addFinding(findings, 'midi-messages', 'extras', 'Choose at least one documented MIDI message type.', undefined, 'midiMessages')
    }
  }

  const presetNames = new Set<string>()
  draft.extras.parameterPresets.forEach((preset) => {
    if (draft.parameters.length === 0) {
      addFinding(findings, 'preset-parameters', 'extras', 'Named parameter starting points need at least one parameter.', preset.id)
    }
    const foldedName = preset.name.toLocaleLowerCase()
    if (!preset.name) addFinding(findings, 'preset-name', 'extras', 'Each named starting point needs a name.', preset.id, 'name')
    else if (presetNames.has(foldedName)) addFinding(findings, 'preset-name-duplicate', 'extras', `Named starting point “${preset.name}” is duplicated.`, preset.id, 'name')
    presetNames.add(foldedName)
    draft.parameters.forEach((parameter) => validatePresetValue(
      parameter,
      preset.valuesByParameterId[parameter.id],
      findings,
      preset,
    ))
    Object.keys(preset.valuesByParameterId).forEach((id) => {
      if (!parameterIds.has(id)) addFinding(findings, 'preset-extra-value', 'extras', `${preset.name || 'Preset'} contains a value for a removed parameter.`, preset.id, id)
    })
  })

  return findings
}

export function luaQuotedString(value: string) {
  let result = '"'
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (character === '"') result += '\\"'
    else if (character === '\\') result += '\\\\'
    else if (character === '\n') result += '\\n'
    else if (character === '\r') result += '\\r'
    else if (character === '\t') result += '\\t'
    else if (code < 32 || code === 127) result += `\\${String(code).padStart(3, '0')}`
    else result += character
  }
  return `${result}"`
}

const INPUT_CONSTANTS: Record<ScaffoldInputKind, string> = {
  cv: 'kCV',
  gate: 'kGate',
  trigger: 'kTrigger',
}
const OUTPUT_CONSTANTS: Record<ScaffoldOutputKind, string> = {
  linear: 'kLinear',
  stepped: 'kStepped',
}
const PRECISION_CONSTANTS: Partial<Record<ScaffoldPrecision, string>> = {
  10: 'kBy10',
  100: 'kBy100',
  1000: 'kBy1000',
}

function renderLuaSequence(values: string[]) {
  return `{ ${values.join(', ')} }`
}

function renderParameter(parameter: ScaffoldParameter) {
  if (parameter.kind === 'choice') {
    const choices = renderLuaSequence(parameter.choices.map(({ label }) => luaQuotedString(label)))
    const selected = parameter.choices.findIndex(({ id }) => id === parameter.defaultChoiceId) + 1
    return `{ ${luaQuotedString(parameter.name)}, ${choices}, ${selected} }`
  }
  const raw = (value: number) => String(Math.round(value * parameter.precision))
  const fields = [
    luaQuotedString(parameter.name),
    raw(parameter.minimum),
    raw(parameter.maximum),
    raw(parameter.defaultValue),
    parameter.unit,
  ]
  const scale = PRECISION_CONSTANTS[parameter.precision]
  if (scale) fields.push(scale)
  return `{ ${fields.join(', ')} }`
}

function renderInit(draft: ScriptScaffoldDraft) {
  const fields: string[] = []
  if (draft.inputs.length > 0) {
    fields.push(`      inputs = ${renderLuaSequence(draft.inputs.map(({ kind }) => INPUT_CONSTANTS[kind]))},`)
    fields.push(`      inputNames = ${renderLuaSequence(draft.inputs.map(({ name }) => luaQuotedString(name)))},`)
  }
  if (draft.outputs.length > 0) {
    fields.push(`      outputs = ${renderLuaSequence(draft.outputs.map(({ kind }) => OUTPUT_CONSTANTS[kind]))},`)
    fields.push(`      outputNames = ${renderLuaSequence(draft.outputs.map(({ name }) => luaQuotedString(name)))},`)
  }
  if (draft.parameters.length > 0) {
    fields.push('      parameters = {')
    draft.parameters.forEach((parameter) => fields.push(`        ${renderParameter(parameter)},`))
    fields.push('      },')
  }
  if (draft.extras.midi) {
    const parameterIndex = draft.parameters.findIndex(({ id }) => id === draft.extras.midi?.parameterId) + 1
    fields.push('      midi = {')
    fields.push(`        channelParameter = ${parameterIndex},`)
    fields.push(`        messages = ${renderLuaSequence(draft.extras.midi.messages.map(luaQuotedString))},`)
    fields.push('      },')
  }

  return [
    '  init = function(self)',
    ...(draft.extras.serialise
      ? ['    -- Restored custom preset data is available as self.state here.']
      : ['    -- Declare inputs, outputs, and parameters here.']),
    '    return {',
    ...fields,
    '    }',
    '  end,',
  ]
}

function renderStep(draft: ScriptScaffoldDraft) {
  const body = draft.outputs.length === 0
    ? ['    -- This runs every 1 ms. Add signal or control processing here.']
    : draft.inputs.length > 0
      ? [
          '    -- This runs every 1 ms. Put signal processing here.',
          '    outputs[1] = inputs[1]',
          ...(draft.outputs.length > 1
            ? ['    -- Assign other outputs only when they need to change.']
            : []),
          '    return outputs',
        ]
      : [
          '    -- This runs every 1 ms. Put signal processing here.',
          '    outputs[1] = 0.0',
          ...(draft.outputs.length > 1
            ? ['    -- Assign other outputs only when they need to change.']
            : []),
          '    return outputs',
        ]
  return ['  step = function(self, dt, inputs)', ...body, '  end,']
}

function renderEdgeCallback(name: 'trigger' | 'gate', hasOutputs: boolean) {
  const signature = name === 'trigger' ? 'self, input' : 'self, input, rising'
  return [
    `  ${name} = function(${signature})`,
    `    -- TODO: Handle the ${name === 'trigger' ? 'rising edge' : 'gate edge'}.`,
    ...(hasOutputs ? ['    return outputs'] : []),
    '  end,',
  ]
}

function renderControlCallback(callback: ScaffoldControlCallback) {
  const option = CONTROL_OPTION_BY_NAME.get(callback)
  const argument = option?.event === 'turn'
    ? (callback.startsWith('encoder') ? ', delta' : ', value')
    : ''
  return [
    `  ${callback} = function(self${argument})`,
    `    -- TODO: Handle ${option?.label ?? callback}.`,
    '  end,',
  ]
}

function renderLuadingPresets(draft: ScriptScaffoldDraft) {
  if (draft.extras.parameterPresets.length === 0) return []
  return [
    '  -- Luading simulator extension; Disting NT hardware ignores this field.',
    '  luading = {',
    '    parameterPresets = {',
    ...draft.extras.parameterPresets.flatMap((preset) => [
      '      {',
      `        name = ${luaQuotedString(preset.name)},`,
      `        values = ${renderLuaSequence(draft.parameters.map((parameter) => String(preset.valuesByParameterId[parameter.id])))},`,
      '      },',
    ]),
    '    },',
    '  },',
    '',
  ]
}

function renderSource(draft: ScriptScaffoldDraft) {
  const lines: string[] = [
    `-- ${draft.name}`,
    `-- ${draft.description}`,
    '',
    ...(draft.outputs.length > 0 ? ['local outputs = {}', ''] : []),
    '-- Add shared state and helper functions above the returned table.',
    'return {',
    `  name = ${luaQuotedString(draft.name)},`,
    `  author = ${luaQuotedString(draft.author)},`,
    '',
    ...renderLuadingPresets(draft),
    ...renderInit(draft),
    '',
    ...renderStep(draft),
  ]

  if (draft.inputs.some(({ kind }) => kind === 'trigger')) {
    lines.push('', ...renderEdgeCallback('trigger', draft.outputs.length > 0))
  }
  if (draft.inputs.some(({ kind }) => kind === 'gate')) {
    lines.push('', ...renderEdgeCallback('gate', draft.outputs.length > 0))
  }
  if (draft.controls.customUi) {
    lines.push('', '  ui = function(self)', '    return true', '  end,')
    if (draft.controls.callbacks.some((callback) => callback.startsWith('pot') && callback.endsWith('Turn'))) {
      lines.push('', '  setupUi = function(self)', '    return { 0.5, 0.5, 0.5 }', '  end,')
    }
    let wroteNonManualComment = false
    draft.controls.callbacks.forEach((callback) => {
      const option = CONTROL_OPTION_BY_NAME.get(callback)
      if (option?.provenance !== 'manual-1.12' && !wroteNonManualComment) {
        lines.push('', '  -- The following control callbacks are not documented for hardware algorithm scripts.')
        wroteNonManualComment = true
      } else {
        lines.push('')
      }
      lines.push(...renderControlCallback(callback))
    })
  }
  if (draft.extras.display !== 'standard') {
    lines.push(
      '',
      '  draw = function(self)',
      '    drawText(8, 20, self.name)',
      ...(draft.extras.display === 'custom-full' ? ['    return true'] : []),
      '  end,',
    )
  }
  if (draft.extras.midi) {
    lines.push(
      '',
      '  midiMessage = function(self, message)',
      '    -- TODO: Handle the filtered MIDI bytes in message.',
      '  end,',
    )
  }
  if (draft.extras.serialise) {
    lines.push(
      '',
      '  serialise = function(self)',
      '    -- Return only JSON-friendly numbers, strings, booleans, tables, and arrays.',
      '    return {}',
      '  end,',
    )
  }

  lines.push('', '  -- Add draw(), trigger(), gate(), MIDI, or UI callbacks here.', '}')
  return lines.join('\n')
}

function buildSummary(draft: ScriptScaffoldDraft): ScaffoldSummary {
  const callbacks = ['init', 'step']
  if (draft.inputs.some(({ kind }) => kind === 'trigger')) callbacks.push('trigger')
  if (draft.inputs.some(({ kind }) => kind === 'gate')) callbacks.push('gate')
  if (draft.controls.customUi) callbacks.push('ui', ...draft.controls.callbacks)
  if (draft.extras.display !== 'standard') callbacks.push('draw')
  if (draft.extras.midi) callbacks.push('midiMessage')
  if (draft.extras.serialise) callbacks.push('serialise')
  return {
    inputCount: draft.inputs.length,
    outputCount: draft.outputs.length,
    parameterCount: draft.parameters.length,
    callbacks,
    hardwareFeatures: [
      ...(draft.controls.customUi ? ['Custom algorithm UI'] : ['Standard parameter UI']),
      ...(draft.extras.display !== 'standard' ? ['Custom display'] : []),
      ...(draft.extras.midi ? ['MIDI input'] : []),
      ...(draft.extras.serialise ? ['Additional preset state'] : []),
    ],
    simulatorExtensions: [
      ...(draft.extras.parameterPresets.length > 0 ? ['Named parameter starting points'] : []),
      ...draft.controls.callbacks
        .filter((callback) => CONTROL_OPTION_BY_NAME.get(callback)?.provenance !== 'manual-1.12')
        .map((callback) => CONTROL_OPTION_BY_NAME.get(callback)?.label ?? callback),
    ],
  }
}

export function generateScriptScaffold(input: ScriptScaffoldDraft): ScriptScaffoldResult {
  const draft = normalizeScriptScaffold(input)
  const findings = validateScriptScaffold(draft)
  if (findings.length > 0) return { ok: false, draft, findings }
  return {
    ok: true,
    draft,
    filename: luaDownloadFilename(draft.name),
    source: renderSource(draft),
    summary: buildSummary(draft),
  }
}

export function isCompatibleMidiParameter(parameter: ScaffoldParameter) {
  return parameter.kind === 'numeric'
    && parameter.precision === 1
    && parameter.minimum <= 0
    && parameter.maximum >= 16
}

export function scaffoldControlProvenance(callback: ScaffoldControlCallback) {
  return CONTROL_OPTION_BY_NAME.get(callback)?.provenance
}

export function scaffoldManifestIsCurrent() {
  const parameterConstants = new Set(
    DISTING_CONSTANTS
      .filter(({ category }) => category === 'parameter-unit')
      .map(({ name }) => name),
  )
  return PARAMETER_UNITS.every(({ name }) => parameterConstants.has(name))
    && SCAFFOLD_CONTROL_OPTIONS.every(({ callback, provenance }) => (
      DISTING_LIFECYCLE_BY_NAME.get(callback)?.provenance === provenance
    ))
}
