import type { LuaInitResult, LuaProgram } from '../emulation/lua-contract'
import { DISTING_CONSTANTS } from '../emulation/lua-contract'
import {
  DISTING_LIFECYCLE,
  distingConstantValues,
} from './api-manifest'
import type { ScriptDiagnostic } from './types'

function semanticLocationForRule(ruleId: string) {
  const parameter = ruleId.match(/^parameter-(\d+)-(\w+)$/)
  if (parameter) {
    const [, index, field] = parameter
    if (['name', 'enum', 'default', 'unit', 'scale'].includes(field)) {
      return `parameters[${index}].${field}`
    }
    return `parameters[${index}]`
  }
  if (ruleId === 'parameters-shape') return 'init.parameters'
  if (ruleId.startsWith('inputNames-')) return 'init.inputNames'
  if (ruleId.startsWith('outputNames-')) return 'init.outputNames'
  if (ruleId.startsWith('inputs-')) return 'init.inputs'
  if (ruleId.startsWith('outputs-')) return 'init.outputs'
  if (ruleId === 'midi-channel-parameter') return 'init.midi.channelParameter'
  if (ruleId === 'midi-messages') return 'init.midi.messages'
  if (ruleId === 'midi-shape') return 'init.midi'
  if (ruleId === 'init-return') return 'callback:init'
  if (ruleId === 'missing-trigger-callback' || ruleId === 'missing-gate-callback') return 'init.inputs'
  if (ruleId === 'unused-trigger-callback') return 'callback:trigger'
  if (ruleId === 'unused-gate-callback') return 'callback:gate'
  if (ruleId === 'outputs-never-updated') return 'init.outputs'
  if (ruleId === 'missing-program-name' || ruleId === 'missing-program-author') return 'top-level'
  const callbackType = ruleId.match(/^(.+)-type$/)
  if (callbackType && DISTING_LIFECYCLE.some((entry) => entry.name === callbackType[1])) {
    return `callback:${callbackType[1]}`
  }
  return undefined
}

const PARAMETER_UNITS = new Set([
  ...distingConstantValues('parameter-unit'),
  ...distingConstantValues('compatibility-alias'),
])
const PARAMETER_SCALES = new Set([1, ...distingConstantValues('parameter-scale')])
const MIDI_MESSAGE_TYPES = new Set([
  'note',
  'cc',
  'bend',
  'aftertouch',
  'poly pressure',
  'program change',
])

export function luaSequence(value: unknown) {
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

function finding(
  ruleId: string,
  severity: ScriptDiagnostic['severity'],
  category: ScriptDiagnostic['category'],
  message: string,
  detail: string,
  suggestion: string | undefined,
  penalty: number,
): ScriptDiagnostic {
  return {
    id: `contract:${ruleId}`,
    ruleId,
    severity,
    category,
    target: 'hardware',
    origin: 'contract',
    message,
    detail,
    suggestion,
    penalty,
    semanticLocation: semanticLocationForRule(ruleId),
  }
}

export function blocksContractExecution(diagnostics: ScriptDiagnostic[]) {
  return diagnostics.some((diagnostic) => (
    diagnostic.origin === 'contract' && diagnostic.severity === 'error'
  ))
}

function validateIo(
  name: 'inputs' | 'outputs',
  raw: unknown,
  allowed: Set<number>,
  diagnostics: ScriptDiagnostic[],
) {
  if (raw === undefined) return 0
  if (typeof raw === 'number') {
    if (!Number.isInteger(raw) || raw < 0 || raw > 28) {
      diagnostics.push(finding(
        `${name}-count`,
        'error',
        'contract',
        `${name} must be an integer from 0 to 28`,
        `Received ${String(raw)}. The Disting NT exposes 28 signal buses.`,
        `Use a count such as ${name} = 2, or an array of input/output type constants.`,
        0,
      ))
      return 0
    }
    return raw
  }

  const entries = luaSequence(raw)
  if (!entries) {
    diagnostics.push(finding(
      `${name}-shape`,
      'error',
      'contract',
      `${name} must be a count or a 1-based table`,
      `The ${name} field returned by init() is neither a number nor a Lua sequence.`,
      `Declare ${name} as a number or a table of Disting type constants.`,
      0,
    ))
    return 0
  }
  if (entries.length > 28) {
    diagnostics.push(finding(
      `${name}-count`,
      'error',
      'contract',
      `${name} declares more than 28 buses`,
      `The table contains ${entries.length} entries, but the hardware exposes 28 buses.`,
      'Reduce the declared bus count to 28 or fewer.',
      0,
    ))
  }
  entries.forEach((entry, index) => {
    if (typeof entry !== 'number' || !allowed.has(entry)) {
      diagnostics.push(finding(
        `${name}-type-${index + 1}`,
        'error',
        'contract',
        `${name}[${index + 1}] uses an invalid type`,
        `Received ${String(entry)} instead of a documented Disting ${name === 'inputs' ? 'input' : 'output'} constant.`,
        `Use ${name === 'inputs' ? 'kCV, kGate, or kTrigger' : 'kStepped or kLinear'}.`,
        0,
      ))
    }
  })
  return entries.length
}

function validateNames(
  name: 'inputNames' | 'outputNames',
  raw: unknown,
  count: number,
  diagnostics: ScriptDiagnostic[],
) {
  if (raw === undefined) return
  const entries = luaSequence(raw)
  if (!entries) {
    diagnostics.push(finding(
      `${name}-shape`,
      'warning',
      'clarity',
      `${name} must be a 1-based table`,
      `The ${name} metadata cannot be read as a Lua sequence.`,
      'Use a table of strings indexed by the corresponding bus number.',
      2,
    ))
    return
  }
  entries.forEach((entry, index) => {
    if (entry !== undefined && typeof entry !== 'string') {
      diagnostics.push(finding(
        `${name}-${index + 1}`,
        'warning',
        'clarity',
        `${name}[${index + 1}] is not a string`,
        'Custom input and output labels should be strings.',
        'Replace this label with a short descriptive string.',
        1,
      ))
    }
    if (index >= count && entry !== undefined) {
      diagnostics.push(finding(
        `${name}-extra-${index + 1}`,
        'warning',
        'clarity',
        `${name}[${index + 1}] has no matching bus`,
        `Only ${count} ${name === 'inputNames' ? 'inputs' : 'outputs'} are declared.`,
        'Remove the extra label or declare the corresponding bus.',
        1,
      ))
    }
  })
}

function validateParameters(raw: unknown, diagnostics: ScriptDiagnostic[]) {
  if (raw === undefined) return
  const parameters = luaSequence(raw)
  if (!parameters) {
    diagnostics.push(finding(
      'parameters-shape',
      'error',
      'contract',
      'parameters must be a 1-based table',
      'The parameters field returned by init() is not a Lua sequence.',
      'Return an array of numeric or enum parameter definitions.',
      0,
    ))
    return
  }

  parameters.forEach((rawDefinition, index) => {
    const definition = luaSequence(rawDefinition)
    const label = `Parameter ${index + 1}`
    if (!definition) {
      diagnostics.push(finding(
        `parameter-${index + 1}-shape`,
        'error',
        'contract',
        `${label} is not a table`,
        'Each parameter must be an array containing its name and definition.',
        'Use { "Name", min, max, default, unit } or { "Name", { "A", "B" }, default }.',
        0,
      ))
      return
    }
    if (typeof definition[0] !== 'string' || definition[0].trim().length === 0) {
      diagnostics.push(finding(
        `parameter-${index + 1}-name`,
        'error',
        'contract',
        `${label} needs a name`,
        'The first element of every parameter definition must be a non-empty string.',
        'Add a short parameter name as the first table element.',
        0,
      ))
    }

    const enumValues = luaSequence(definition[1])
    if (enumValues) {
      if (
        enumValues.length === 0
        || enumValues.some((value) => typeof value !== 'string' && typeof value !== 'number')
      ) {
        diagnostics.push(finding(
          `parameter-${index + 1}-enum`,
          'error',
          'contract',
          `${label} has invalid enum values`,
          'Enum parameters need a non-empty table of displayable strings or numbers.',
          'Replace the enum values with strings or numbers such as { "Off", "On" } or { 24, 48, 96 }.',
          0,
        ))
      }
      if (
        typeof definition[2] !== 'number'
        || !Number.isInteger(definition[2])
        || definition[2] < 1
        || definition[2] > enumValues.length
      ) {
        diagnostics.push(finding(
          `parameter-${index + 1}-default`,
          'error',
          'contract',
          `${label} has an invalid enum default`,
          `The default must be an integer from 1 to ${enumValues.length}.`,
          'Choose the 1-based index of an enum value.',
          0,
        ))
      }
      return
    }

    const [minimum, maximum, defaultValue, unit, scale = 1] = definition.slice(1)
    if (![minimum, maximum, defaultValue].every((value) => typeof value === 'number' && Number.isFinite(value))) {
      diagnostics.push(finding(
        `parameter-${index + 1}-numbers`,
        'error',
        'contract',
        `${label} needs numeric range values`,
        'Numeric parameters require finite minimum, maximum, and default values.',
        'Use { "Name", min, max, default, unit, optionalScale }.',
        0,
      ))
      return
    }
    if (![minimum, maximum, defaultValue].every(Number.isInteger)) {
      diagnostics.push(finding(
        `parameter-${index + 1}-integers`,
        'error',
        'contract',
        `${label} uses fractional raw values`,
        'Numeric parameter minimum, maximum, and default fields must be integers. A scale constant exposes fractional values to Lua.',
        'Use integer raw fields and add kBy10, kBy100, or kBy1000 when the parameter needs fractional steps.',
        0,
      ))
    }
    if ((minimum as number) > (maximum as number)) {
      diagnostics.push(finding(
        `parameter-${index + 1}-range`,
        'error',
        'contract',
        `${label} has minimum greater than maximum`,
        `The range ${minimum}…${maximum} cannot be represented by the parameter system.`,
        'Swap or correct the minimum and maximum values.',
        0,
      ))
    }
    if ((defaultValue as number) < (minimum as number) || (defaultValue as number) > (maximum as number)) {
      diagnostics.push(finding(
        `parameter-${index + 1}-default`,
        'error',
        'contract',
        `${label} default is outside its range`,
        `The default ${defaultValue} is not between ${minimum} and ${maximum}.`,
        'Choose a default value inside the declared range.',
        0,
      ))
    }
    if (unit !== undefined && (typeof unit !== 'number' || !PARAMETER_UNITS.has(unit))) {
      diagnostics.push(finding(
        `parameter-${index + 1}-unit`,
        'error',
        'contract',
        `${label} uses an unknown unit`,
        'The parameter unit must be one of the documented kNone, kHz, kVolts, and related constants.',
        'Use a documented Disting parameter unit constant.',
        0,
      ))
    }
    if (typeof scale !== 'number' || !PARAMETER_SCALES.has(scale)) {
      diagnostics.push(finding(
        `parameter-${index + 1}-scale`,
        'error',
        'contract',
        `${label} uses an invalid scale`,
        'The optional scale must be kBy10, kBy100, or kBy1000.',
        'Remove the scale or use a documented scale constant.',
        0,
      ))
    }
  })
}

function validateMidi(raw: unknown, parameterCount: number, diagnostics: ScriptDiagnostic[]) {
  if (raw === undefined) return
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    diagnostics.push(finding(
      'midi-shape',
      'error',
      'contract',
      'midi must be a configuration table',
      'MIDI filtering requires channelParameter and messages fields.',
      'Return midi = { channelParameter = 1, messages = { "note", "cc" } } from init().',
      0,
    ))
    return
  }

  const midi = raw as { channelParameter?: unknown; messages?: unknown }
  if (
    typeof midi.channelParameter !== 'number'
    || !Number.isInteger(midi.channelParameter)
    || midi.channelParameter < 1
    || midi.channelParameter > parameterCount
  ) {
    diagnostics.push(finding(
      'midi-channel-parameter',
      'error',
      'contract',
      'midi.channelParameter is invalid',
      `The channel selector must reference one of the ${parameterCount} declared parameters.`,
      'Use the 1-based index of a 0–16 MIDI channel parameter.',
      0,
    ))
  }

  const messages = luaSequence(midi.messages)
  if (
    !messages
    || messages.length === 0
    || messages.some((message) => typeof message !== 'string' || !MIDI_MESSAGE_TYPES.has(message))
  ) {
    diagnostics.push(finding(
      'midi-messages',
      'error',
      'contract',
      'midi.messages contains an unknown message type',
      'The native MIDI filter only supports the message types documented by Disting NT.',
      'Use note, cc, bend, aftertouch, poly pressure, or program change.',
      0,
    ))
  }
}

export function validateProgramContract(program: LuaProgram, init: unknown): ScriptDiagnostic[] {
  const diagnostics: ScriptDiagnostic[] = []

  for (const { name: callback } of DISTING_LIFECYCLE) {
    const value = program[callback]
    if (value !== undefined && typeof value !== 'function') {
      diagnostics.push(finding(
        `${callback}-type`,
        'error',
        'contract',
        `${callback} must be a function`,
        `The returned script table defines ${callback} as ${typeof value}.`,
        `Remove ${callback} or replace it with a lifecycle function.`,
        0,
      ))
    }
  }

  if (init !== undefined && (typeof init !== 'object' || init === null)) {
    diagnostics.push(finding(
      'init-return',
      'error',
      'contract',
      'init() must return a metadata table',
      `Received ${typeof init} instead of the table that declares inputs, outputs, and parameters.`,
      'Return a table from init(), or omit init() for a zero-I/O script.',
      0,
    ))
    return diagnostics
  }

  const metadata = (init ?? {}) as LuaInitResult
  const inputCount = validateIo(
    'inputs',
    metadata.inputs,
    new Set([DISTING_CONSTANTS.kCV, DISTING_CONSTANTS.kGate, DISTING_CONSTANTS.kTrigger]),
    diagnostics,
  )
  const outputCount = validateIo(
    'outputs',
    metadata.outputs,
    new Set([DISTING_CONSTANTS.kStepped, DISTING_CONSTANTS.kLinear]),
    diagnostics,
  )
  validateNames('inputNames', metadata.inputNames, inputCount, diagnostics)
  validateNames('outputNames', metadata.outputNames, outputCount, diagnostics)
  validateParameters(metadata.parameters, diagnostics)
  validateMidi(metadata.midi, luaSequence(metadata.parameters)?.length ?? 0, diagnostics)

  const inputs = luaSequence(metadata.inputs)
  const hasTrigger = inputs?.some((value) => value === DISTING_CONSTANTS.kTrigger) ?? false
  const hasGate = inputs?.some((value) => value === DISTING_CONSTANTS.kGate) ?? false
  if (hasTrigger && typeof program.trigger !== 'function') {
    diagnostics.push(finding(
      'missing-trigger-callback',
      'info',
      'contract',
      'Trigger input has no trigger() callback',
      'The system will detect trigger edges, but the script has no callback to receive them.',
      'Add trigger(self, input), or declare this input as kCV if it will be polled.',
      0,
    ))
  }
  if (hasGate && typeof program.gate !== 'function') {
    diagnostics.push(finding(
      'missing-gate-callback',
      'info',
      'contract',
      'Gate input has no gate() callback',
      'The system will detect gate edges, but the script has no callback to receive them.',
      'Add gate(self, input, rising), or declare this input as kCV if it will be polled.',
      0,
    ))
  }
  if (!hasTrigger && typeof program.trigger === 'function') {
    diagnostics.push(finding(
      'unused-trigger-callback',
      'info',
      'clarity',
      'trigger() has no matching kTrigger input',
      'The callback will not be invoked by the declared input configuration.',
      'Declare a trigger input or remove the unused callback.',
      0,
    ))
  }
  if (!hasGate && typeof program.gate === 'function') {
    diagnostics.push(finding(
      'unused-gate-callback',
      'info',
      'clarity',
      'gate() has no matching kGate input',
      'The callback will not be invoked by the declared input configuration.',
      'Declare a gate input or remove the unused callback.',
      0,
    ))
  }
  if (outputCount > 0 && !program.step && !program.trigger && !program.gate) {
    diagnostics.push(finding(
      'outputs-never-updated',
      'warning',
      'contract',
      'Declared outputs have no update callback',
      'No step(), trigger(), or gate() callback can provide output voltages.',
      'Add the lifecycle callback that produces the declared outputs.',
      5,
    ))
  }
  if (!program.name) {
    diagnostics.push(finding(
      'missing-program-name',
      'info',
      'clarity',
      'The returned script table has no name',
      'A name makes the algorithm easier to identify in the preset.',
      'Add name = "Short script name" to the returned table.',
      0,
    ))
  }
  if (!program.author) {
    diagnostics.push(finding(
      'missing-program-author',
      'info',
      'clarity',
      'The returned script table has no author',
      'Author metadata helps users identify and maintain installed scripts.',
      'Add author = "Name" to the returned table.',
      0,
    ))
  }
  return diagnostics
}
