import { describe, expect, it } from 'vitest'
import { DISTING_MIDI_DESTINATION_BITS } from '../types'
import {
  assignedWebMidiOutputIds,
  DISTING_MIDI_ALL_DESTINATIONS_MASK,
  DISTING_MIDI_DESTINATIONS,
  distingMidiDestinationsForMask,
} from './midi-routing'

describe('Disting MIDI routing model', () => {
  it('pins the documented destination bits and labels', () => {
    expect(DISTING_MIDI_DESTINATION_BITS).toEqual({
      breakout: 0x1,
      selectBus: 0x2,
      usb: 0x4,
      internal: 0x8,
    })
    expect(DISTING_MIDI_ALL_DESTINATIONS_MASK).toBe(0x0f)
    expect(DISTING_MIDI_DESTINATIONS).toEqual([
      { id: 'breakout', bit: 0x1, label: 'MIDI breakout' },
      { id: 'selectBus', bit: 0x2, label: 'Select Bus' },
      { id: 'usb', bit: 0x4, label: 'USB' },
      { id: 'internal', bit: 0x8, label: 'Internal' },
    ])
  })

  it('expands zero, individual, and combined masks in hardware order', () => {
    expect(distingMidiDestinationsForMask(0)).toEqual([])
    expect(distingMidiDestinationsForMask(0x4)).toEqual(['usb'])
    expect(distingMidiDestinationsForMask(0x0f)).toEqual([
      'breakout',
      'selectBus',
      'usb',
      'internal',
    ])
  })

  it('normalizes unsafe masks to the documented four bits', () => {
    expect(distingMidiDestinationsForMask(0x14)).toEqual(['usb'])
    expect(distingMidiDestinationsForMask(2.9)).toEqual(['selectBus'])
    expect(distingMidiDestinationsForMask(Number.NaN)).toEqual([])
  })

  it('resolves configured ports and deduplicates shared physical outputs', () => {
    expect(assignedWebMidiOutputIds(0x0f, {
      breakout: 'din-out',
      selectBus: 'shared-out',
      usb: 'shared-out',
    })).toEqual(['din-out', 'shared-out'])
    expect(assignedWebMidiOutputIds(0x8, {
      usb: 'usb-out',
    })).toEqual([])
  })
})
