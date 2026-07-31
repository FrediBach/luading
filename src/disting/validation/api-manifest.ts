import type { LuaCallbackName } from './types'

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

export type DistingApiEntry = {
  name: string
  signature: string
  detail: string
  documentation: string
  parameters: string[]
  support: DistingApiSupport
  supportDetail?: string
  contexts?: LuaCallbackName[]
  insertText?: string
}

function api(
  name: string,
  signature: string,
  documentation: string,
  options: Partial<Pick<
    DistingApiEntry,
    'support' | 'supportDetail' | 'contexts' | 'insertText'
  >> = {},
): DistingApiEntry {
  const parameters = signature
    .slice(signature.indexOf('(') + 1, -1)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  return {
    name,
    signature,
    detail: `disting NT · ${documentation.split('.')[0]}`,
    documentation,
    parameters,
    support: options.support ?? 'full',
    supportDetail: options.supportDetail,
    contexts: options.contexts,
    insertText: options.insertText,
  }
}

const DRAW_CONTEXT: LuaCallbackName[] = ['draw']
const PRESET_SUPPORT_DETAIL = 'The simulator currently uses one Lua Script plus a fixed Looper fixture instead of a configurable firmware preset.'
const PARAMETER_SUPPORT_DETAIL = 'The simulator exposes script parameters and a fixed companion fixture, but not the firmware-wide system and routing parameter namespace.'

export const DISTING_API_PROFILE = 'Disting NT Lua 1.12'

export const DISTING_API: DistingApiEntry[] = [
  api('findAlgorithm', 'findAlgorithm(name)', 'Finds matching algorithms by their displayed name.', {
    support: 'partial',
    supportDetail: PRESET_SUPPORT_DETAIL,
    insertText: 'findAlgorithm(${1:"Algorithm name"})',
  }),
  api('getAlgorithmCount', 'getAlgorithmCount()', 'Returns the number of algorithms in the preset.', {
    support: 'partial',
    supportDetail: PRESET_SUPPORT_DETAIL,
  }),
  api('getAlgorithmName', 'getAlgorithmName(algorithmIndex)', 'Returns an algorithm display name.', {
    support: 'partial',
    supportDetail: PRESET_SUPPORT_DETAIL,
  }),
  api('getCurrentAlgorithm', 'getCurrentAlgorithm()', 'Returns the current algorithm index.', {
    support: 'partial',
    supportDetail: PRESET_SUPPORT_DETAIL,
  }),
  api('findParameter', 'findParameter(algorithmIndex, name)', 'Finds matching parameters by name.', {
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
    insertText: 'findParameter(${1:algorithmIndex}, ${2:"Parameter name"})',
  }),
  api('focusParameter', 'focusParameter(algorithmIndex, parameterIndex)', 'Focuses an algorithm parameter in the UI.', {
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
  }),
  api('getCurrentParameter', 'getCurrentParameter(algorithmIndex)', 'Returns the current firmware-wide parameter index.', {
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
  }),
  api('getParameter', 'getParameter(algorithmIndex, parameterIndex)', 'Returns an algorithm parameter value.', {
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
  }),
  api('getParameterCount', 'getParameterCount(algorithmIndex)', 'Returns the number of parameters in an algorithm.', {
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
  }),
  api('getParameterName', 'getParameterName(algorithmIndex, parameterIndex)', 'Returns an algorithm parameter name.', {
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
  }),
  api('setParameter', 'setParameter(algorithmIndex, parameterIndex, value, focus?)', 'Sets an algorithm parameter value.', {
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
    insertText: 'setParameter(${1:algorithmIndex}, ${2:parameterIndex}, ${3:value}, ${4:true})',
  }),
  api('setParameterNormalized', 'setParameterNormalized(algorithmIndex, parameterIndex, value, focus?)', 'Sets a parameter using a normalized value.', {
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
  }),
  api('standardPot1Turn', 'standardPot1Turn(value)', 'Performs the standard pot 1 action.', {
    support: 'partial',
    supportDetail: 'Parameter page selection and the firmware-wide parameter namespace are not yet modeled.',
  }),
  api('standardPot2Turn', 'standardPot2Turn(value)', 'Performs the standard pot 2 action.', {
    support: 'partial',
    supportDetail: 'Parameter-within-page selection is not yet modeled independently from global parameter selection.',
  }),
  api('standardPot3Turn', 'standardPot3Turn(value)', 'Performs the standard pot 3 action.', {
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
  }),
  api('drawAlgorithmUI', 'drawAlgorithmUI(algorithmIndex)', 'Draws an algorithm custom UI.', {
    support: 'partial',
    supportDetail: 'The simulator draws a labeled placeholder instead of delegating to the target algorithm UI.',
    contexts: DRAW_CONTEXT,
  }),
  api('drawBox', 'drawBox(x1, y1, x2, y2, colour?)', 'Draws an outlined integer-coordinate box.', {
    contexts: DRAW_CONTEXT,
  }),
  api('drawSmoothBox', 'drawSmoothBox(x1, y1, x2, y2, colour?)', 'Draws an antialiased box.', {
    support: 'approximation',
    supportDetail: 'Browser Canvas 2D antialiasing is used instead of a deterministic 16-shade firmware framebuffer rasterizer.',
    contexts: DRAW_CONTEXT,
  }),
  api('drawCircle', 'drawCircle(x, y, radius, colour?)', 'Draws an integer-coordinate circle.', {
    contexts: DRAW_CONTEXT,
  }),
  api('drawSmoothCircle', 'drawSmoothCircle(x, y, radius, colour?)', 'Draws an antialiased circle.', {
    support: 'approximation',
    supportDetail: 'Browser Canvas 2D antialiasing is used instead of a deterministic 16-shade firmware framebuffer rasterizer.',
    contexts: DRAW_CONTEXT,
  }),
  api('drawLine', 'drawLine(x1, y1, x2, y2, colour?)', 'Draws an integer-coordinate line.', {
    contexts: DRAW_CONTEXT,
  }),
  api('drawSmoothLine', 'drawSmoothLine(x1, y1, x2, y2, colour?)', 'Draws an antialiased line.', {
    support: 'approximation',
    supportDetail: 'Browser Canvas 2D antialiasing is used instead of a deterministic 16-shade firmware framebuffer rasterizer.',
    contexts: DRAW_CONTEXT,
  }),
  api('drawParameterLine', 'drawParameterLine(algorithmIndex, parameterIndex, yOffset)', 'Draws a parameter information line.', {
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
    contexts: DRAW_CONTEXT,
  }),
  api('drawRectangle', 'drawRectangle(x1, y1, x2, y2, colour?)', 'Draws a filled integer-coordinate rectangle.', {
    contexts: DRAW_CONTEXT,
  }),
  api('drawStandardParameterLine', 'drawStandardParameterLine()', 'Draws the standard current-parameter line.', {
    support: 'partial',
    supportDetail: PARAMETER_SUPPORT_DETAIL,
    contexts: DRAW_CONTEXT,
  }),
  api('drawText', 'drawText(x, y, text, colour?, alignment?)', 'Draws text in the standard font.', {
    contexts: DRAW_CONTEXT,
  }),
  api('drawTinyText', 'drawTinyText(x, y, text, colour?, alignment?)', 'Draws text in the tiny 3×5 font.', {
    contexts: DRAW_CONTEXT,
  }),
  api('exit', 'exit()', 'Returns control from a UI script to the normal module UI.', {
    support: 'unsupported',
    supportDetail: 'Separate UI scripts are not implemented; the compatibility adapter registered for algorithm scripts is not firmware-conformant.',
  }),
  api('getBusVoltage', 'getBusVoltage(algorithmIndex, busIndex)', 'Returns a bus voltage at an algorithm input.', {
    support: 'partial',
    supportDetail: 'The adapter reads the current script input array, not 28-bus snapshots at each preset position.',
  }),
  api('getCpuCycleCount', 'getCpuCycleCount()', 'Returns the 600 MHz 32-bit CPU cycle counter.', {
    support: 'approximation',
    supportDetail: 'The value is derived from browser wall time and is not a Disting NT CPU-cycle measurement.',
  }),
  api('sendI2CCommand', 'sendI2CCommand(address, ...bytes)', 'Sends an I2C command to the simulator event log.', {
    support: 'mock',
    supportDetail: 'The command is clamped and logged; no physical I2C transaction occurs.',
  }),
  api('sendI2CGetter', 'sendI2CGetter(address, responseLength, ...bytes)', 'Sends an I2C request and returns deterministic zero-filled mock bytes.', {
    support: 'mock',
    supportDetail: 'The request is logged and returns zero-filled bytes; no physical I2C transaction occurs.',
  }),
  api('sendMIDI', 'sendMIDI(destinations, ...bytes)', 'Sends a MIDI message to the simulator event log.', {
    support: 'mock',
    supportDetail: 'The message is clamped and logged; it is not transmitted to a MIDI destination.',
  }),
  api('setDisplayMode', 'setDisplayMode(mode)', 'Changes the simulated module display mode.', {
    support: 'partial',
    supportDetail: 'System screens are labeled placeholders and algorithm-view history is not yet modeled.',
  }),
  api('print', 'print(...)', 'Writes values to the Lua console.'),
]

export const DISTING_API_BY_NAME = new Map(DISTING_API.map((entry) => [entry.name, entry]))

export const DISTING_CONSTANT_NAMES = [
  'kCV',
  'kGate',
  'kTrigger',
  'kStepped',
  'kLinear',
  'kNone',
  'kDb',
  'kDb_minInf',
  'kPercent',
  'kHz',
  'kSemitones',
  'kCents',
  'kMs',
  'kMilliseconds',
  'kSeconds',
  'kFrames',
  'kMIDINote',
  'kMillivolts',
  'kVolts',
  'kBPM',
  'kBy10',
  'kBy100',
  'kBy1000',
] as const
