import type { LuaCallbackName } from './types'

export type DistingApiEntry = {
  name: string
  signature: string
  detail: string
  documentation: string
  parameters: string[]
  simulator: boolean
  contexts?: LuaCallbackName[]
  insertText?: string
}

function api(
  name: string,
  signature: string,
  documentation: string,
  options: Partial<Pick<DistingApiEntry, 'simulator' | 'contexts' | 'insertText'>> = {},
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
    simulator: options.simulator ?? false,
    contexts: options.contexts,
    insertText: options.insertText,
  }
}

const DRAW_CONTEXT: LuaCallbackName[] = ['draw']

export const DISTING_API_PROFILE = 'Disting NT Lua 1.12'

export const DISTING_API: DistingApiEntry[] = [
  api('findAlgorithm', 'findAlgorithm(name)', 'Finds matching algorithms by their displayed name.', {
    simulator: true,
    insertText: 'findAlgorithm(${1:"Algorithm name"})',
  }),
  api('getAlgorithmCount', 'getAlgorithmCount()', 'Returns the number of algorithms in the preset.', { simulator: true }),
  api('getAlgorithmName', 'getAlgorithmName(algorithmIndex)', 'Returns an algorithm display name.', { simulator: true }),
  api('getCurrentAlgorithm', 'getCurrentAlgorithm()', 'Returns the current algorithm index.', {
    simulator: true,
  }),
  api('findParameter', 'findParameter(algorithmIndex, name)', 'Finds matching parameters by name.', {
    simulator: true,
    insertText: 'findParameter(${1:algorithmIndex}, ${2:"Parameter name"})',
  }),
  api('focusParameter', 'focusParameter(algorithmIndex, parameterIndex)', 'Focuses an algorithm parameter in the UI.', { simulator: true }),
  api('getCurrentParameter', 'getCurrentParameter(algorithmIndex)', 'Returns the current firmware-wide parameter index.', {
    simulator: true,
  }),
  api('getParameter', 'getParameter(algorithmIndex, parameterIndex)', 'Returns an algorithm parameter value.', { simulator: true }),
  api('getParameterCount', 'getParameterCount(algorithmIndex)', 'Returns the number of parameters in an algorithm.', { simulator: true }),
  api('getParameterName', 'getParameterName(algorithmIndex, parameterIndex)', 'Returns an algorithm parameter name.', { simulator: true }),
  api('setParameter', 'setParameter(algorithmIndex, parameterIndex, value, focus?)', 'Sets an algorithm parameter value.', {
    simulator: true,
    insertText: 'setParameter(${1:algorithmIndex}, ${2:parameterIndex}, ${3:value}, ${4:true})',
  }),
  api('setParameterNormalized', 'setParameterNormalized(algorithmIndex, parameterIndex, value, focus?)', 'Sets a parameter using a normalized value.', { simulator: true }),
  api('standardPot1Turn', 'standardPot1Turn(value)', 'Performs the standard pot 1 action.', { simulator: true }),
  api('standardPot2Turn', 'standardPot2Turn(value)', 'Performs the standard pot 2 action.', { simulator: true }),
  api('standardPot3Turn', 'standardPot3Turn(value)', 'Performs the standard pot 3 action.', { simulator: true }),
  api('drawAlgorithmUI', 'drawAlgorithmUI(algorithmIndex)', 'Draws an algorithm custom UI.', { simulator: true, contexts: DRAW_CONTEXT }),
  api('drawBox', 'drawBox(x1, y1, x2, y2, colour?)', 'Draws an outlined integer-coordinate box.', {
    simulator: true,
    contexts: DRAW_CONTEXT,
  }),
  api('drawSmoothBox', 'drawSmoothBox(x1, y1, x2, y2, colour?)', 'Draws an antialiased box.', {
    simulator: true,
    contexts: DRAW_CONTEXT,
  }),
  api('drawCircle', 'drawCircle(x, y, radius, colour?)', 'Draws an integer-coordinate circle.', {
    simulator: true,
    contexts: DRAW_CONTEXT,
  }),
  api('drawSmoothCircle', 'drawSmoothCircle(x, y, radius, colour?)', 'Draws an antialiased circle.', {
    simulator: true,
    contexts: DRAW_CONTEXT,
  }),
  api('drawLine', 'drawLine(x1, y1, x2, y2, colour?)', 'Draws an integer-coordinate line.', {
    simulator: true,
    contexts: DRAW_CONTEXT,
  }),
  api('drawSmoothLine', 'drawSmoothLine(x1, y1, x2, y2, colour?)', 'Draws an antialiased line.', {
    simulator: true,
    contexts: DRAW_CONTEXT,
  }),
  api('drawParameterLine', 'drawParameterLine(algorithmIndex, parameterIndex, yOffset)', 'Draws a parameter information line.', {
    simulator: true,
    contexts: DRAW_CONTEXT,
  }),
  api('drawRectangle', 'drawRectangle(x1, y1, x2, y2, colour?)', 'Draws a filled integer-coordinate rectangle.', {
    simulator: true,
    contexts: DRAW_CONTEXT,
  }),
  api('drawStandardParameterLine', 'drawStandardParameterLine()', 'Draws the standard current-parameter line.', {
    simulator: true,
    contexts: DRAW_CONTEXT,
  }),
  api('drawText', 'drawText(x, y, text, colour?, alignment?)', 'Draws text in the standard font.', {
    simulator: true,
    contexts: DRAW_CONTEXT,
  }),
  api('drawTinyText', 'drawTinyText(x, y, text, colour?, alignment?)', 'Draws text in the tiny 3×5 font.', {
    simulator: true,
    contexts: DRAW_CONTEXT,
  }),
  api('exit', 'exit()', 'Returns control from a UI script to the normal module UI.', { simulator: true }),
  api('getBusVoltage', 'getBusVoltage(algorithmIndex, busIndex)', 'Returns a bus voltage at an algorithm input.', {
    simulator: true,
  }),
  api('getCpuCycleCount', 'getCpuCycleCount()', 'Returns the 600 MHz 32-bit CPU cycle counter.', {
    simulator: true,
  }),
  api('sendI2CCommand', 'sendI2CCommand(address, ...bytes)', 'Sends an I2C command to the simulator event log.', { simulator: true }),
  api('sendI2CGetter', 'sendI2CGetter(address, responseLength, ...bytes)', 'Sends an I2C request and returns deterministic zero-filled mock bytes.', { simulator: true }),
  api('sendMIDI', 'sendMIDI(destinations, ...bytes)', 'Sends a MIDI message to the simulator event log.', { simulator: true }),
  api('setDisplayMode', 'setDisplayMode(mode)', 'Changes the simulated module display mode.', { simulator: true }),
  api('print', 'print(...)', 'Writes values to the Lua console.', { simulator: true }),
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
