export type DistingApiSupport =
  | 'full'
  | 'partial'
  | 'approximation'
  | 'mock'
  | 'unsupported'

export const DISTING_API_SUPPORT: Record<
  DistingApiSupport,
  { label: string; diagnostic: string }
> = {
  full: {
    label: 'full simulation',
    diagnostic: 'is fully simulated',
  },
  partial: {
    label: 'partial simulation',
    diagnostic: 'is only partially simulated',
  },
  approximation: {
    label: 'browser approximation',
    diagnostic: 'uses a browser approximation',
  },
  mock: {
    label: 'simulator mock',
    diagnostic: 'uses a simulator mock',
  },
  unsupported: {
    label: 'unsupported',
    diagnostic: 'is not supported by this simulator',
  },
}

export type DistingContractProvenance =
  | 'manual-1.12'
  | 'hardware-verified'
  | 'official-corpus'
  | 'simulator-extension'

export const DISTING_CONTRACT_PROVENANCE: Record<
  DistingContractProvenance,
  { label: string; detail: string }
> = {
  'manual-1.12': {
    label: 'manual 1.12',
    detail: 'Documented by the Disting NT Lua Scripting 1.12 manual.',
  },
  'hardware-verified': {
    label: 'hardware verified',
    detail: 'Verified on Disting NT hardware.',
  },
  'official-corpus': {
    label: 'observed in official scripts',
    detail: 'Observed in scripts published by Expert Sleepers, but not documented by the 1.12 manual.',
  },
  'simulator-extension': {
    label: 'simulator extension',
    detail: 'Provided by the simulator and not presented as documented Disting NT behavior.',
  },
}

export type DistingValueType =
  | 'any'
  | 'boolean'
  | 'byte'
  | 'function'
  | 'integer'
  | 'nil'
  | 'number'
  | 'string'
  | 'table'

export type DistingParameterChoice = string | number | boolean

export type DistingApiParameter = {
  name: string
  acceptedTypes: readonly DistingValueType[]
  optional?: boolean
  choices?: readonly DistingParameterChoice[]
  default?: DistingParameterChoice
  description?: string
  snippetDefault?: string
  variadic?: {
    min: number
    max?: number
  }
}

export type DistingApiReturn = {
  acceptedTypes: readonly DistingValueType[]
  multiplicity?: 'single' | 'multiple'
  description: string
}

export type DistingApiOverload = {
  parameters: readonly DistingApiParameter[]
  returns: readonly DistingApiReturn[]
  provenance?: DistingContractProvenance
}

export type DistingScriptKind = 'algorithm' | 'ui'

type DistingTurnCallback = `${'pot1' | 'pot2' | 'pot3' | 'encoder1' | 'encoder2'}Turn`
type DistingPressCallback = `${
  | 'pot1'
  | 'pot2'
  | 'pot3'
  | 'encoder1'
  | 'encoder2'
  | 'button1'
  | 'button2'
  | 'button3'
  | 'button4'
}${'Push' | 'Release'}`

export type DistingLifecycleName =
  | 'init'
  | 'step'
  | 'trigger'
  | 'gate'
  | 'draw'
  | 'ui'
  | 'setupUi'
  | 'midiMessage'
  | 'serialise'
  | DistingTurnCallback
  | DistingPressCallback

export type DistingApiEntry = {
  name: string
  signature: string
  detail: string
  documentation: string
  overloads: readonly DistingApiOverload[]
  returns: readonly DistingApiReturn[]
  support: DistingApiSupport
  supportDetail?: string
  contexts?: readonly DistingLifecycleName[]
  insertText?: string
  provenance: DistingContractProvenance
  runtimeRegistration: 'worker' | 'display' | 'lua'
}

const noReturn = (description = 'Returns nothing.'): readonly DistingApiReturn[] => [{
  acceptedTypes: ['nil'],
  description,
}]

const oneReturn = (
  acceptedTypes: readonly DistingValueType[],
  description: string,
): readonly DistingApiReturn[] => [{ acceptedTypes, description }]

const multipleReturns = (
  acceptedTypes: readonly DistingValueType[],
  description: string,
): readonly DistingApiReturn[] => [{
  acceptedTypes,
  multiplicity: 'multiple',
  description,
}]

const parameter = (
  name: string,
  acceptedTypes: DistingValueType | readonly DistingValueType[],
  options: Omit<DistingApiParameter, 'name' | 'acceptedTypes'> = {},
): DistingApiParameter => ({
  name,
  acceptedTypes: typeof acceptedTypes === 'string' ? [acceptedTypes] : acceptedTypes,
  ...options,
})

const numberParameter = (name: string, snippetDefault = '0') => (
  parameter(name, 'number', { snippetDefault })
)
const integerParameter = (name: string, snippetDefault = '1') => (
  parameter(name, 'integer', { snippetDefault })
)
const stringParameter = (name: string, snippetDefault = '"Text"') => (
  parameter(name, 'string', { snippetDefault })
)

function formatParameter(entry: DistingApiParameter) {
  if (entry.variadic) return `...${entry.name}`
  return `${entry.name}${entry.optional ? '?' : ''}`
}

export function formatApiSignature(name: string, overload: DistingApiOverload) {
  return `${name}(${overload.parameters.map(formatParameter).join(', ')})`
}

type ApiOptions = {
  returns?: readonly DistingApiReturn[]
  overloads?: readonly Omit<DistingApiOverload, 'returns'>[]
  support?: DistingApiSupport
  supportDetail?: string
  contexts?: readonly DistingLifecycleName[]
  insertText?: string
  provenance?: DistingContractProvenance
  runtimeRegistration?: DistingApiEntry['runtimeRegistration']
}

function api(
  name: string,
  parameters: readonly DistingApiParameter[],
  documentation: string,
  options: ApiOptions = {},
): DistingApiEntry {
  const returns = options.returns ?? noReturn()
  const overloads = (options.overloads ?? [{ parameters }]).map((overload) => ({
    ...overload,
    returns,
  }))

  return {
    name,
    signature: formatApiSignature(name, overloads[0]),
    detail: `disting NT · ${documentation.split('.')[0]}`,
    documentation,
    overloads,
    returns,
    support: options.support ?? 'full',
    supportDetail: options.supportDetail,
    contexts: options.contexts,
    insertText: options.insertText,
    provenance: options.provenance ?? 'manual-1.12',
    runtimeRegistration: options.runtimeRegistration
      ?? (options.contexts ? 'display' : 'worker'),
  }
}

export function apiOverloadArity(overload: DistingApiOverload) {
  let min = 0
  let max = 0
  let unbounded = false

  for (const entry of overload.parameters) {
    if (entry.variadic) {
      min += entry.variadic.min
      if (entry.variadic.max === undefined) unbounded = true
      else max += entry.variadic.max
      continue
    }
    if (!entry.optional) min += 1
    max += 1
  }

  return { min, max: unbounded ? undefined : max }
}

export function apiAcceptsArgumentCount(entry: DistingApiEntry, count: number) {
  return entry.overloads.some((overload) => {
    const arity = apiOverloadArity(overload)
    return count >= arity.min && (arity.max === undefined || count <= arity.max)
  })
}

export function formatApiArity(entry: DistingApiEntry) {
  const arities = entry.overloads.map(apiOverloadArity)
  const min = Math.min(...arities.map((arity) => arity.min))
  const unbounded = arities.some((arity) => arity.max === undefined)
  const max = unbounded ? undefined : Math.max(...arities.map((arity) => arity.max ?? arity.min))
  if (max === undefined) return `at least ${min}`
  return min === max ? String(min) : `${min}–${max}`
}

const DRAW_CONTEXT: readonly DistingLifecycleName[] = ['draw']
const PRESET_SUPPORT_DETAIL = 'The simulator currently uses one Lua Script plus a fixed Looper fixture instead of a configurable firmware preset.'
const PARAMETER_SUPPORT_DETAIL = 'The Lua Script system and script namespaces are modeled, but companion algorithms still use a fixed fixture and routing changes do not yet feed a 28-bus preset pipeline.'
const algorithmIndex = integerParameter('algorithmIndex')
const parameterIndex = integerParameter('parameterIndex')
const colour = numberParameter('colour', '15')
const byteValues = parameter('bytes', 'byte', {
  snippetDefault: '0x90',
  variadic: { min: 1 },
})

export const DISTING_API_PROFILE = 'Disting NT Lua 1.12'

export const DISTING_API: DistingApiEntry[] = [
  api('findAlgorithm', [stringParameter('name', '"Algorithm name"')], 'Finds matching algorithms by their displayed name.', {
    returns: multipleReturns(['integer', 'nil'], 'Returns each matching 1-based algorithm index as a separate result.'),
    support: 'partial',
    supportDetail: PRESET_SUPPORT_DETAIL,
    runtimeRegistration: 'lua',
  }),
  api('getAlgorithmCount', [], 'Returns the number of algorithms in the preset.', {
    returns: oneReturn(['integer'], 'Returns the algorithm count.'),
    support: 'partial',
    supportDetail: PRESET_SUPPORT_DETAIL,
  }),
  api('getAlgorithmName', [algorithmIndex], 'Returns an algorithm display name.', {
    returns: oneReturn(['string', 'nil'], 'Returns the displayed name, or nil for an unknown index.'),
    support: 'partial',
    supportDetail: PRESET_SUPPORT_DETAIL,
  }),
  api('getCurrentAlgorithm', [], 'Returns the current algorithm index.', {
    returns: oneReturn(['integer'], 'Returns the current 1-based algorithm index.'),
    support: 'partial',
    supportDetail: PRESET_SUPPORT_DETAIL,
  }),
  api('findParameter', [algorithmIndex, stringParameter('name', '"Parameter name"')], 'Finds matching parameters by name.', {
    returns: multipleReturns(['integer', 'nil'], 'Returns each matching firmware-wide parameter index as a separate result.'),
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
    runtimeRegistration: 'lua',
  }),
  api('focusParameter', [algorithmIndex, parameterIndex], 'Focuses an algorithm parameter in the UI.', {
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
  }),
  api('getCurrentParameter', [algorithmIndex], 'Returns the current firmware-wide parameter index.', {
    returns: oneReturn(['integer', 'nil'], 'Returns the current parameter index, or nil for an unknown algorithm.'),
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
  }),
  api('getParameter', [algorithmIndex, parameterIndex], 'Returns an algorithm parameter value.', {
    returns: oneReturn(['number', 'nil'], 'Returns the parameter value, or nil for an unknown parameter.'),
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
  }),
  api('getParameterCount', [algorithmIndex], 'Returns the number of parameters in an algorithm.', {
    returns: oneReturn(['integer', 'nil'], 'Returns the parameter count, or nil for an unknown algorithm.'),
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
  }),
  api('getParameterName', [algorithmIndex, parameterIndex], 'Returns an algorithm parameter name.', {
    returns: oneReturn(['string', 'nil'], 'Returns the parameter name, or nil for an unknown parameter.'),
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
  }),
  api('setParameter', [
    algorithmIndex,
    parameterIndex,
    numberParameter('value'),
    parameter('focus', 'boolean', { optional: true, default: true, snippetDefault: 'true' }),
  ], 'Sets an algorithm parameter value.', {
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
  }),
  api('setParameterNormalized', [
    algorithmIndex,
    parameterIndex,
    numberParameter('value', '0.5'),
    parameter('focus', 'boolean', { optional: true, default: true, snippetDefault: 'true' }),
  ], 'Sets a parameter using a normalized value.', {
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
  }),
  api('standardPot1Turn', [numberParameter('value', '0.5')], 'Performs the standard pot 1 action.', {
    support: 'partial',
    supportDetail: 'Parameter page selection and the firmware-wide parameter namespace are not yet modeled.',
  }),
  api('standardPot2Turn', [numberParameter('value', '0.5')], 'Performs the standard pot 2 action.', {
    support: 'partial',
    supportDetail: 'Parameter-within-page selection is not yet modeled independently from global parameter selection.',
  }),
  api('standardPot3Turn', [numberParameter('value', '0.5')], 'Performs the standard pot 3 action.', {
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
  }),
  api('drawAlgorithmUI', [algorithmIndex], 'Draws an algorithm custom UI.', {
    support: 'partial',
    supportDetail: 'The simulator draws a labeled placeholder instead of delegating to the target algorithm UI.',
    contexts: DRAW_CONTEXT,
  }),
  api('drawBox', [numberParameter('x1'), numberParameter('y1'), numberParameter('x2'), numberParameter('y2'), colour], 'Draws an outlined integer-coordinate box.', {
    contexts: DRAW_CONTEXT,
  }),
  api('drawSmoothBox', [numberParameter('x1'), numberParameter('y1'), numberParameter('x2'), numberParameter('y2'), colour], 'Draws an antialiased box.', {
    support: 'approximation',
    supportDetail: 'Browser Canvas 2D antialiasing is used instead of a deterministic 16-shade firmware framebuffer rasterizer.',
    contexts: DRAW_CONTEXT,
    provenance: 'official-corpus',
  }),
  api('drawCircle', [numberParameter('x'), numberParameter('y'), numberParameter('radius'), colour], 'Draws an integer-coordinate circle.', {
    contexts: DRAW_CONTEXT,
  }),
  api('drawSmoothCircle', [numberParameter('x'), numberParameter('y'), numberParameter('radius'), colour], 'Draws an antialiased circle.', {
    support: 'approximation',
    supportDetail: 'Browser Canvas 2D antialiasing is used instead of a deterministic 16-shade firmware framebuffer rasterizer.',
    contexts: DRAW_CONTEXT,
  }),
  api('drawLine', [numberParameter('x1'), numberParameter('y1'), numberParameter('x2'), numberParameter('y2'), colour], 'Draws an integer-coordinate line.', {
    contexts: DRAW_CONTEXT,
  }),
  api('drawSmoothLine', [numberParameter('x1'), numberParameter('y1'), numberParameter('x2'), numberParameter('y2'), colour], 'Draws an antialiased line.', {
    support: 'approximation',
    supportDetail: 'Browser Canvas 2D antialiasing is used instead of a deterministic 16-shade firmware framebuffer rasterizer.',
    contexts: DRAW_CONTEXT,
  }),
  api('drawParameterLine', [algorithmIndex, parameterIndex, numberParameter('yOffset')], 'Draws a parameter information line.', {
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
    contexts: DRAW_CONTEXT,
  }),
  api('drawRectangle', [numberParameter('x1'), numberParameter('y1'), numberParameter('x2'), numberParameter('y2'), colour], 'Draws a filled integer-coordinate rectangle.', {
    contexts: DRAW_CONTEXT,
  }),
  api('drawStandardParameterLine', [], 'Draws the standard current-parameter line.', {
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
    contexts: DRAW_CONTEXT,
  }),
  api('drawText', [
    numberParameter('x'),
    numberParameter('y'),
    stringParameter('text'),
    parameter('colour', 'number', { optional: true, default: 15, snippetDefault: '15' }),
    parameter('alignment', 'string', {
      optional: true,
      choices: ['left', 'centre', 'right'],
      default: 'left',
      snippetDefault: '"left"',
    }),
  ], 'Draws text in the standard font.', {
    contexts: DRAW_CONTEXT,
  }),
  api('drawTinyText', [
    numberParameter('x'),
    numberParameter('y'),
    stringParameter('text'),
    parameter('colour', 'number', { optional: true, default: 15, snippetDefault: '15' }),
    parameter('alignment', 'string', {
      optional: true,
      choices: ['left', 'centre', 'right'],
      default: 'left',
      snippetDefault: '"left"',
    }),
  ], 'Draws text in the tiny 3×5 font.', {
    contexts: DRAW_CONTEXT,
  }),
  api('exit', [], 'Returns control from a UI script to the normal module UI.', {
    support: 'unsupported',
    supportDetail: 'Separate UI scripts are not implemented; the compatibility adapter registered for algorithm scripts is not firmware-conformant.',
  }),
  api('getBusVoltage', [algorithmIndex, integerParameter('busIndex', '0')], 'Returns a bus voltage at an algorithm input.', {
    returns: oneReturn(['number'], 'Returns the bus voltage.'),
    support: 'partial',
    supportDetail: 'The adapter reads the current script input array, not 28-bus snapshots at each preset position.',
  }),
  api('getCpuCycleCount', [], 'Returns the 600 MHz 32-bit CPU cycle counter.', {
    returns: oneReturn(['integer'], 'Returns the unsigned 32-bit cycle count.'),
    support: 'approximation',
    supportDetail: 'The value is derived from browser wall time and is not a Disting NT CPU-cycle measurement.',
  }),
  api('sendI2CCommand', [integerParameter('address', '0x32'), byteValues], 'Sends an I2C command to the simulator event log.', {
    overloads: [
      { parameters: [integerParameter('address', '0x32'), byteValues] },
      { parameters: [integerParameter('address', '0x32'), parameter('bytes', 'table', { snippetDefault: '{ 0x46 }' })] },
    ],
    support: 'mock',
    supportDetail: 'The command is clamped and logged; no physical I2C transaction occurs.',
  }),
  api('sendI2CGetter', [integerParameter('address', '0x32'), integerParameter('responseLength'), byteValues], 'Sends an I2C request and returns deterministic zero-filled mock bytes.', {
    overloads: [
      { parameters: [integerParameter('address', '0x32'), integerParameter('responseLength'), byteValues] },
      { parameters: [integerParameter('address', '0x32'), integerParameter('responseLength'), parameter('bytes', 'table', { snippetDefault: '{ 0x48 }' })] },
    ],
    returns: oneReturn(['table'], 'Returns a 1-based table of response bytes.'),
    support: 'mock',
    supportDetail: 'The request is logged and returns zero-filled bytes; no physical I2C transaction occurs.',
  }),
  api('sendMIDI', [
    integerParameter('destinations', '0x4'),
    parameter('bytes', 'byte', {
      snippetDefault: '0x90',
      variadic: { min: 1, max: 3 },
    }),
  ], 'Sends a MIDI message to its configured Disting destination routes.', {
    support: 'partial',
    supportDetail: 'The message is clamped and logged, then transmitted to Web MIDI outputs assigned to the documented destination bits. Browser permission and device availability still apply.',
  }),
  api('setDisplayMode', [parameter('mode', 'string', {
    choices: ['overview', 'meters', 'parameters', 'ui', 'algorithm', 'menu'],
    snippetDefault: '"algorithm"',
  })], 'Changes the simulated module display mode.', {
    support: 'partial',
    supportDetail: 'System screens are labeled placeholders and algorithm-view history is not yet modeled.',
  }),
  api('print', [parameter('values', 'any', {
    snippetDefault: '"message"',
    variadic: { min: 0 },
  })], 'Writes values to the Lua console.'),
]

export const DISTING_API_BY_NAME = new Map(DISTING_API.map((entry) => [entry.name, entry]))

export function compareDistingApiSurface(names: Iterable<string>) {
  const actual = new Set(names)
  return {
    missing: DISTING_API
      .map((entry) => entry.name)
      .filter((name) => !actual.has(name)),
    unexpected: [...actual].filter((name) => !DISTING_API_BY_NAME.has(name)),
  }
}

export type DistingConstantCategory =
  | 'input-type'
  | 'output-mode'
  | 'parameter-unit'
  | 'parameter-scale'
  | 'compatibility-alias'

export type DistingConstantEntry = {
  name: string
  value: number
  category: DistingConstantCategory
  documentation: string
  provenance: DistingContractProvenance
  aliasFor?: string
}

function constant(
  name: string,
  value: number,
  category: DistingConstantCategory,
  documentation: string,
  options: Pick<Partial<DistingConstantEntry>, 'provenance' | 'aliasFor'> = {},
): DistingConstantEntry {
  return {
    name,
    value,
    category,
    documentation,
    provenance: options.provenance ?? 'manual-1.12',
    aliasFor: options.aliasFor,
  }
}

export const DISTING_CONSTANTS: readonly DistingConstantEntry[] = [
  constant('kCV', 0, 'input-type', 'CV input.'),
  constant('kGate', 1, 'input-type', 'Gate input.'),
  constant('kTrigger', 2, 'input-type', 'Trigger input.'),
  constant('kStepped', 0, 'output-mode', 'Stepped output.'),
  constant('kLinear', 1, 'output-mode', 'Linearly interpolated output.'),
  constant('kNone', 0, 'parameter-unit', 'No parameter unit.'),
  constant('kDb', 1, 'parameter-unit', 'Decibel parameter unit.'),
  constant('kDb_minInf', 13, 'parameter-unit', 'Decibel unit with a negative-infinity minimum.'),
  constant('kPercent', 2, 'parameter-unit', 'Percent parameter unit.'),
  constant('kHz', 3, 'parameter-unit', 'Hertz parameter unit.'),
  constant('kSemitones', 4, 'parameter-unit', 'Semitone parameter unit.'),
  constant('kCents', 5, 'parameter-unit', 'Cents parameter unit.'),
  constant('kMs', 6, 'parameter-unit', 'Milliseconds parameter unit.'),
  constant('kSeconds', 7, 'parameter-unit', 'Seconds parameter unit.'),
  constant('kFrames', 8, 'parameter-unit', 'Frames parameter unit.'),
  constant('kMIDINote', 9, 'parameter-unit', 'MIDI note parameter unit.'),
  constant('kMillivolts', 10, 'parameter-unit', 'Millivolts parameter unit.'),
  constant('kVolts', 11, 'parameter-unit', 'Volts parameter unit.'),
  constant('kBPM', 12, 'parameter-unit', 'Beats-per-minute parameter unit.'),
  constant('kBy10', 10, 'parameter-scale', 'Divide raw parameter values by 10.'),
  constant('kBy100', 100, 'parameter-scale', 'Divide raw parameter values by 100.'),
  constant('kBy1000', 1000, 'parameter-scale', 'Divide raw parameter values by 1000.'),
  constant('kMilliseconds', 6, 'compatibility-alias', 'Compatibility alias for kMs.', {
    provenance: 'official-corpus',
    aliasFor: 'kMs',
  }),
  constant('kInt', 0, 'compatibility-alias', 'Compatibility alias used as an integer parameter unit.', {
    provenance: 'official-corpus',
    aliasFor: 'kNone',
  }),
  constant('kInteger', 0, 'compatibility-alias', 'Compatibility alias used as an integer parameter unit.', {
    provenance: 'official-corpus',
    aliasFor: 'kNone',
  }),
  constant('kEnum', 0, 'compatibility-alias', 'Compatibility alias used by enum parameter definitions.', {
    provenance: 'official-corpus',
    aliasFor: 'kNone',
  }),
  constant('kBool', 0, 'compatibility-alias', 'Compatibility alias used by boolean-style parameter definitions.', {
    provenance: 'official-corpus',
    aliasFor: 'kNone',
  }),
]

export const DISTING_CONSTANT_NAMES = DISTING_CONSTANTS.map((entry) => entry.name)

export const DISTING_CONSTANT_VALUES: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(DISTING_CONSTANTS.map((entry) => [entry.name, entry.value])),
)

export function distingConstantValues(category: DistingConstantCategory) {
  return new Set(
    DISTING_CONSTANTS
      .filter((entry) => entry.category === category)
      .map((entry) => entry.value),
  )
}

export type DistingLifecycleEntry = {
  name: DistingLifecycleName
  parameters: readonly DistingApiParameter[]
  signature: string
  documentation: string
  validScriptKinds: readonly DistingScriptKind[]
  returnSemantics: string
  cadence: string
  snippet: string
  provenance: DistingContractProvenance
  customUi?: boolean
}

function lifecycle(
  name: DistingLifecycleName,
  parameters: readonly DistingApiParameter[],
  documentation: string,
  returnSemantics: string,
  cadence: string,
  snippetBody: readonly string[],
  options: Pick<Partial<DistingLifecycleEntry>, 'provenance' | 'customUi'> = {},
): DistingLifecycleEntry {
  return {
    name,
    parameters,
    signature: `${name} = function(${parameters.map((entry) => entry.name).join(', ')})`,
    documentation,
    validScriptKinds: ['algorithm'],
    returnSemantics,
    cadence,
    snippet: [
      `${name} = function(${parameters.map((entry) => entry.name).join(', ')})`,
      ...snippetBody.map((line) => `  ${line}`),
      'end,',
    ].join('\n'),
    provenance: options.provenance ?? 'manual-1.12',
    customUi: options.customUi,
  }
}

const self = parameter('self', 'table')
const lifecycleValue = numberParameter('value', '0.5')

const CORE_LIFECYCLE: readonly DistingLifecycleEntry[] = [
  lifecycle('init', [self], 'Declare inputs, outputs, parameters, and MIDI filtering.', 'Returns the metadata table, or nil for a zero-I/O script.', 'Once when the script loads.', [
    'return {',
    '  inputs = { ${1:kCV} },',
    '  inputNames = { "${2:Input}" },',
    '  outputs = { ${3:kLinear} },',
    '  outputNames = { "${4:Output}" },',
    '  parameters = {',
    '    { "${5:Amount}", ${6:0}, ${7:100}, ${8:50}, ${9:kPercent} },',
    '  },',
    '}',
  ]),
  lifecycle('step', [self, numberParameter('dt', '0.001'), parameter('inputs', 'table')], 'Update outputs from the current input voltages.', 'Returns a sparse 1-based table of output voltages, or nil.', 'Every 1 ms.', [
    '${1:out[1] = inputs[1]}',
    'return out',
  ]),
  lifecycle('trigger', [self, integerParameter('input')], 'Handle a rising edge on a kTrigger input.', 'Returns a sparse 1-based table of output voltages, or nil.', 'On each trigger rising edge.', [
    '${1:-- Handle the rising edge}',
  ]),
  lifecycle('gate', [self, integerParameter('input'), parameter('rising', 'boolean')], 'Handle either edge on a kGate input.', 'Returns a sparse 1-based table of output voltages, or nil.', 'On each gate edge.', [
    '${1:-- Handle the gate edge}',
  ]),
  lifecycle('draw', [self], 'Draw the custom 256×64 display.', 'Return true to suppress the standard parameter line; otherwise return nil or false.', 'Approximately 30 fps.', [
    '${1:drawText(8, 20, self.name)}',
    'return true',
  ]),
  lifecycle('ui', [self], 'Opt into custom front-panel behavior.', 'Returns true to enable custom UI callbacks.', 'When the algorithm UI is selected.', [
    'return true',
  ], { customUi: true }),
  lifecycle('setupUi', [self], 'Provide normalized pot positions for soft takeover.', 'Returns a sparse array of pot positions in the range 0.0–1.0.', 'When the algorithm UI first appears.', [
    'return { ${1:0.5}, ${2:0.5}, ${3:0.5} }',
  ], { customUi: true }),
  lifecycle('midiMessage', [self, parameter('message', 'table')], 'Handle a message selected by init().midi filtering.', 'Returns nothing.', 'When a matching MIDI message arrives.', [
    'local status = message[1]',
    '${1:-- Handle the MIDI bytes}',
  ]),
  lifecycle('serialise', [self], 'Store JSON-compatible state in the preset.', 'Returns a JSON-compatible state table.', 'When preset state is saved.', [
    'return {',
    '  ${1:value = self.value},',
    '}',
  ]),
]

type UiCallbackSpec = {
  name: DistingLifecycleName
  parameters: readonly DistingApiParameter[]
  documentation: string
  returnSemantics: string
  cadence: string
  provenance?: DistingContractProvenance
}

const POT_TURN_CALLBACKS = ['pot1Turn', 'pot2Turn', 'pot3Turn'] as const
const ENCODER_TURN_CALLBACKS = ['encoder1Turn', 'encoder2Turn'] as const
const POT_PRESS_CALLBACKS = [
  'pot1Push',
  'pot1Release',
  'pot2Push',
  'pot2Release',
  'pot3Push',
  'pot3Release',
] as const
const ENCODER_PRESS_CALLBACKS = [
  'encoder1Push',
  'encoder1Release',
  'encoder2Push',
  'encoder2Release',
] as const
const BUTTON_CALLBACKS = [
  'button1Push',
  'button1Release',
  'button2Push',
  'button2Release',
  'button3Push',
  'button3Release',
  'button4Push',
  'button4Release',
] as const

const UI_CALLBACKS: readonly UiCallbackSpec[] = [
  ...POT_TURN_CALLBACKS.map((name) => ({
    name,
    parameters: [self, lifecycleValue],
    documentation: 'Handle a normalized pot position.',
    returnSemantics: 'Returns nothing.',
    cadence: 'When the corresponding pot turns.',
  })),
  ...ENCODER_TURN_CALLBACKS.map((name) => ({
    name,
    parameters: [self, numberParameter('delta', '1')],
    documentation: 'Handle an encoder turn.',
    returnSemantics: 'Returns nothing.',
    cadence: 'When the corresponding encoder turns.',
  })),
  ...POT_PRESS_CALLBACKS.map((name) => ({
    name,
    parameters: [self],
    documentation: 'Handle a pot push or release.',
    returnSemantics: 'Returns nothing.',
    cadence: 'When the corresponding pot is pushed or released.',
    provenance: name.startsWith('pot3')
      ? 'manual-1.12' as const
      : name === 'pot2Push'
        ? 'official-corpus' as const
        : 'simulator-extension' as const,
  })),
  ...ENCODER_PRESS_CALLBACKS.map((name) => ({
    name,
    parameters: [self],
    documentation: 'Handle an encoder push or release.',
    returnSemantics: 'Returns nothing.',
    cadence: 'When the corresponding encoder is pushed or released.',
    provenance: name.startsWith('encoder2')
      ? 'manual-1.12' as const
      : name === 'encoder1Push'
        ? 'official-corpus' as const
        : 'simulator-extension' as const,
  })),
  ...BUTTON_CALLBACKS.map((name) => ({
    name,
    parameters: [self],
    documentation: 'Handle a front-panel button push or release.',
    returnSemantics: 'Returns nothing.',
    cadence: 'When the corresponding button is pushed or released.',
    provenance: 'simulator-extension' as const,
  })),
]

export const DISTING_LIFECYCLE: readonly DistingLifecycleEntry[] = [
  ...CORE_LIFECYCLE,
  ...UI_CALLBACKS.map((entry) => lifecycle(
    entry.name,
    entry.parameters,
    entry.documentation,
    entry.returnSemantics,
    entry.cadence,
    ['${1:-- Handle the control event}'],
    { customUi: true, provenance: entry.provenance },
  )),
]

export const DISTING_LIFECYCLE_BY_NAME = new Map(
  DISTING_LIFECYCLE.map((entry) => [entry.name, entry]),
)

export const DISTING_LIFECYCLE_NAMES = DISTING_LIFECYCLE.map((entry) => entry.name)
