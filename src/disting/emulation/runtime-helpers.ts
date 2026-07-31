import type { InputKind } from '../types'
import type { LuaCallbackName, ScriptDiagnostic } from '../validation/types'
import { callbackOutputEntries } from './callback-output'

function runtimeDiagnostic(
  ruleId: string,
  callback: LuaCallbackName,
  message: string,
  detail: string,
  suggestion?: string,
): ScriptDiagnostic {
  return {
    id: `runtime:${ruleId}:${callback}`,
    ruleId,
    severity: 'error',
    category: 'contract',
    target: 'hardware',
    origin: 'runtime',
    callback,
    semanticLocation: `callback:${callback}`,
    message,
    detail,
    suggestion,
    penalty: 0,
  }
}

export function applyCallbackOutput(
  outputs: number[],
  next: unknown,
  callback: LuaCallbackName,
) {
  const diagnostics: ScriptDiagnostic[] = []
  const entries = callbackOutputEntries(next)
  if (entries === undefined) return diagnostics
  if (entries === null) {
    diagnostics.push(runtimeDiagnostic(
      'callback-output-table',
      callback,
      `${callback}() returned a non-table value`,
      `Output callbacks must return a Lua table or nil, but received ${typeof next}.`,
      'Return a 1-based table of output voltages, an empty table, or nil.',
    ))
    return diagnostics
  }

  for (const [outputNumber, value] of entries) {
    if (outputNumber > outputs.length) {
      diagnostics.push({
        ...runtimeDiagnostic(
          `callback-output-index-${outputNumber}`,
          callback,
          `${callback}() returned undeclared output ${outputNumber}`,
          `The script declares ${outputs.length} outputs, so output index ${outputNumber} cannot be updated.`,
          'Declare the additional output in init() or remove this table entry.',
        ),
        id: `runtime:callback-output-index-${outputNumber}:${callback}`,
      })
      continue
    }
    if (value === undefined) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      diagnostics.push({
        ...runtimeDiagnostic(
          `callback-output-value-${outputNumber}`,
          callback,
          `${callback}() returned an invalid voltage for output ${outputNumber}`,
          `Output voltages must be finite numbers, but received ${String(value)}.`,
          'Ensure all output calculations produce finite numeric voltages.',
        ),
        id: `runtime:callback-output-value-${outputNumber}:${callback}`,
      })
      continue
    }
    outputs[outputNumber - 1] = value
  }

  return diagnostics
}

export type InputEdgeEvent =
  | { kind: 'trigger'; input: number }
  | { kind: 'gate'; input: number; rising: boolean }

export function detectInputEdges(
  inputs: number[],
  inputKinds: InputKind[],
  previousHigh: boolean[],
  highThresholdVolts = 1,
) {
  const nextHigh = [...previousHigh]
  const events: InputEdgeEvent[] = []

  for (let index = 0; index < inputs.length; index += 1) {
    const high = (inputs[index] ?? 0) >= highThresholdVolts
    const wasHigh = previousHigh[index] ?? false
    nextHigh[index] = high
    if (high === wasHigh) continue

    if (inputKinds[index] === 'trigger' && high) {
      events.push({ kind: 'trigger', input: index + 1 })
    } else if (inputKinds[index] === 'gate') {
      events.push({ kind: 'gate', input: index + 1, rising: high })
    }
  }

  return { events, nextHigh }
}

export function midiMessageType(status: number) {
  const kind = status & 0xf0
  if (kind === 0x80 || kind === 0x90) return 'note'
  if (kind === 0xa0) return 'poly pressure'
  if (kind === 0xb0) return 'cc'
  if (kind === 0xc0) return 'program change'
  if (kind === 0xd0) return 'aftertouch'
  if (kind === 0xe0) return 'bend'
  return undefined
}

export function prepareMidiMessage(
  bytes: number[],
  midi: { channelParameter?: number; messages: string[] } | undefined,
  parameters: unknown[] | undefined,
) {
  if (!midi || bytes.length === 0) return undefined
  const message = bytes.slice(0, 3).map((value) => (
    Math.min(255, Math.max(0, Math.trunc(value)))
  ))
  const type = midiMessageType(message[0] ?? 0)
  if (midi.messages.length > 0 && (!type || !midi.messages.includes(type))) return undefined

  const channelParameter = midi.channelParameter
  if (channelParameter !== undefined && channelParameter > 0) {
    const selectedChannel = parameters?.[channelParameter - 1]
    if (selectedChannel === 0) return undefined
    const messageChannel = ((message[0] ?? 0) & 0x0f) + 1
    if (typeof selectedChannel === 'number' && selectedChannel !== messageChannel) return undefined
  }

  return message
}

export function serialiseJsonState(value: unknown) {
  try {
    return { state: JSON.parse(JSON.stringify(value)) as unknown }
  } catch {
    return {
      state: null,
      error: 'serialise() returned data that could not be represented as JSON.',
    }
  }
}

export function sourceErrorDiagnostic(message: string): ScriptDiagnostic {
  const location = message.match(/script\.lua:(\d+)(?::(\d+))?/)
  const line = location ? Number(location[1]) : undefined
  const column = location?.[2] ? Number(location[2]) : 1
  return {
    id: `runtime:lua-error:${line ?? 0}:${column}`,
    ruleId: 'lua-runtime-error',
    severity: 'error',
    category: 'contract',
    target: 'hardware',
    origin: 'runtime',
    message: line ? `Lua error on line ${line}` : 'Lua execution error',
    detail: message,
    suggestion: 'Fix the reported Lua error and run the script again.',
    penalty: 0,
    range: line ? {
      startLine: line,
      startColumn: column,
      endLine: line,
      endColumn: column + 1,
    } : undefined,
  }
}

export function uiCallbackName(control: string, event: string) {
  return `${control}${event[0]?.toUpperCase() ?? ''}${event.slice(1)}`
}
