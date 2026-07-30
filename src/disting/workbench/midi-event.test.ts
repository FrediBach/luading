import { describe, expect, it } from 'vitest'
import {
  createMidiEventRequest,
  formatMidiByte,
  MIDI_MESSAGE_PRESETS,
  parseMidiByte,
  parseMidiMessage,
} from './midi-event'

describe('MIDI event utility', () => {
  it('formats bytes as two-digit hexadecimal values', () => {
    expect(formatMidiByte(0)).toBe('0x00')
    expect(formatMidiByte(0x90)).toBe('0x90')
    expect(formatMidiByte(255)).toBe('0xFF')
  })

  it('accepts decimal and hexadecimal byte entry', () => {
    expect(parseMidiByte('144')).toBe(144)
    expect(parseMidiByte('0x90')).toBe(144)
    expect(parseMidiByte('FF')).toBe(255)
    expect(parseMidiByte(' 64 ')).toBe(64)
  })

  it('rejects incomplete, fractional, and out-of-range bytes', () => {
    expect(parseMidiByte('')).toBeNull()
    expect(parseMidiByte('1.5')).toBeNull()
    expect(parseMidiByte('-1')).toBeNull()
    expect(parseMidiByte('256')).toBeNull()
    expect(parseMidiByte('0xGG')).toBeNull()
  })

  it('validates complete three-byte messages and exposes common presets', () => {
    expect(parseMidiMessage(['0x90', '60', '100'])).toEqual([144, 60, 100])
    expect(parseMidiMessage(['0x90', '', '100'])).toBeNull()
    expect(parseMidiMessage(['0x90', '60'])).toBeNull()
    expect(MIDI_MESSAGE_PRESETS.map((preset) => preset.id)).toEqual([
      'note-on',
      'note-off',
      'control-change',
    ])
  })

  it('preserves validated byte ordering in the worker send request', () => {
    expect(createMidiEventRequest([0x90, 60, 100])).toEqual({
      type: 'midi',
      bytes: [0x90, 60, 100],
    })
  })
})
