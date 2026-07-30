import type { WorkerRequest } from '../types'

export interface MidiMessagePreset {
  id: 'note-on' | 'note-off' | 'control-change'
  label: string
  bytes: [number, number, number]
}

export const MIDI_MESSAGE_PRESETS: MidiMessagePreset[] = [
  {
    id: 'note-on',
    label: 'Note on',
    bytes: [0x90, 60, 100],
  },
  {
    id: 'note-off',
    label: 'Note off',
    bytes: [0x80, 60, 0],
  },
  {
    id: 'control-change',
    label: 'Control change',
    bytes: [0xb0, 1, 127],
  },
]

export function formatMidiByte(value: number) {
  return `0x${value.toString(16).padStart(2, '0').toUpperCase()}`
}

export function parseMidiByte(value: string): number | null {
  const trimmed = value.trim()
  let parsed: number

  if (/^0x[0-9a-f]{1,2}$/i.test(trimmed)) {
    parsed = Number.parseInt(trimmed.slice(2), 16)
  } else if (/^[0-9]{1,3}$/.test(trimmed)) {
    parsed = Number.parseInt(trimmed, 10)
  } else if (/^[0-9a-f]{1,2}$/i.test(trimmed) && /[a-f]/i.test(trimmed)) {
    parsed = Number.parseInt(trimmed, 16)
  } else {
    return null
  }

  return parsed >= 0 && parsed <= 255 ? parsed : null
}

export function parseMidiMessage(values: readonly string[]) {
  if (values.length !== 3) return null
  const bytes = values.map(parseMidiByte)
  return bytes.every((byte): byte is number => byte !== null)
    ? bytes
    : null
}

export function createMidiEventRequest(
  bytes: readonly number[],
): Extract<WorkerRequest, { type: 'midi' }> {
  return { type: 'midi', bytes: [...bytes] }
}
