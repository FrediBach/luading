import { describe, expect, it } from 'vitest'
import { DISTING_MIDI_DESTINATION_BITS } from '../types'
import {
  assignedWebMidiOutputIds,
  defaultWebMidiInputMapping,
  DISTING_MIDI_ALL_DESTINATIONS_MASK,
  DISTING_MIDI_DESTINATIONS,
  distingMidiDestinationsForMask,
  initialWebMidiInputValue,
  WebMidiInputRouter,
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

describe('Web MIDI input routing', () => {
  it('provides hardware-input-appropriate mapping defaults', () => {
    expect(defaultWebMidiInputMapping('cv', 'keys')).toMatchObject({
      kind: 'cc', portId: 'keys', controller: 1, minimumVolts: 0, maximumVolts: 5,
    })
    expect(defaultWebMidiInputMapping('gate', 'keys')).toMatchObject({
      kind: 'noteGate', lowVolts: 0, highVolts: 5,
    })
    expect(defaultWebMidiInputMapping('trigger', 'keys')).toMatchObject({
      kind: 'noteTrigger', lowVolts: 0, highVolts: 5,
    })
  })

  it('converts CC, pitch bend, note pitch, and velocity into held voltages atomically', () => {
    const router = new WebMidiInputRouter()
    router.configure([
      { kind: 'cc', portId: 'keys', channel: 2, controller: 74, minimumVolts: -5, maximumVolts: 5 },
      { kind: 'pitchBend', portId: 'keys', channel: 2, minimumVolts: -1, maximumVolts: 1 },
      { kind: 'notePitch', portId: 'keys', channel: 2, baseNote: 60, baseVoltage: 0 },
      { kind: 'noteVelocity', portId: 'keys', channel: 2, note: 'any', minimumVolts: 0, maximumVolts: 10 },
    ])

    expect(router.route({ portId: 'keys', bytes: [0xb1, 74, 127] })).toEqual([
      { index: 0, value: 5 },
    ])
    expect(router.route({ portId: 'keys', bytes: [0xe1, 0x7f, 0x7f] })).toEqual([
      { index: 1, value: 1 },
    ])
    expect(router.route({ portId: 'keys', bytes: [0x91, 72, 64] })).toEqual([
      { index: 2, value: 1 },
      { index: 3, value: 10 * 64 / 127 },
    ])
    expect(router.route({ portId: 'keys', bytes: [0x81, 72, 0] })).toEqual([
      { index: 3, value: 0 },
    ])
  })

  it('tracks polyphonic note gates and treats note-on velocity zero as note-off', () => {
    const router = new WebMidiInputRouter()
    router.configure([{
      kind: 'noteGate', portId: 'keys', channel: 'omni', note: 'any', lowVolts: -1, highVolts: 5,
    }])

    expect(router.route({ portId: 'keys', bytes: [0x90, 60, 100] })).toEqual([{ index: 0, value: 5 }])
    expect(router.route({ portId: 'keys', bytes: [0x91, 60, 100] })).toEqual([{ index: 0, value: 5 }])
    expect(router.route({ portId: 'keys', bytes: [0x90, 64, 100] })).toEqual([{ index: 0, value: 5 }])
    expect(router.route({ portId: 'keys', bytes: [0x80, 60, 0] })).toEqual([{ index: 0, value: 5 }])
    expect(router.route({ portId: 'keys', bytes: [0x90, 64, 0] })).toEqual([{ index: 0, value: 5 }])
    expect(router.route({ portId: 'keys', bytes: [0x81, 60, 0] })).toEqual([{ index: 0, value: -1 }])
  })

  it('emits note-on pulses and CC threshold-crossing pulses without repeats while high', () => {
    const router = new WebMidiInputRouter()
    router.configure([
      { kind: 'noteTrigger', portId: 'pads', channel: 10, note: 36, lowVolts: 0, highVolts: 5 },
      { kind: 'ccTrigger', portId: 'pads', channel: 10, controller: 1, threshold: 64, lowVolts: 0, highVolts: 8 },
    ])

    expect(router.route({ portId: 'pads', bytes: [0x99, 36, 127] })).toEqual([{ index: 0, pulse: 5 }])
    expect(router.route({ portId: 'pads', bytes: [0xb9, 1, 63] })).toEqual([])
    expect(router.route({ portId: 'pads', bytes: [0xb9, 1, 64] })).toEqual([{ index: 1, pulse: 8 }])
    expect(router.route({ portId: 'pads', bytes: [0xb9, 1, 127] })).toEqual([])
    expect(router.route({ portId: 'pads', bytes: [0xb9, 1, 0] })).toEqual([])
    expect(router.route({ portId: 'pads', bytes: [0xb9, 1, 100] })).toEqual([{ index: 1, pulse: 8 }])
  })

  it('holds thresholded CC gates at their configured low and high voltages', () => {
    const router = new WebMidiInputRouter()
    router.configure([{
      kind: 'ccGate',
      portId: 'faders',
      channel: 'omni',
      controller: 12,
      threshold: 32,
      lowVolts: -2,
      highVolts: 10,
    }])

    expect(router.route({ portId: 'faders', bytes: [0xb0, 12, 31] })).toEqual([
      { index: 0, value: -2 },
    ])
    expect(router.route({ portId: 'faders', bytes: [0xbf, 12, 32] })).toEqual([
      { index: 0, value: 10 },
    ])
  })

  it('filters ports, channels, notes, controllers, and resets edge state with mappings', () => {
    const router = new WebMidiInputRouter()
    const mapping = {
      kind: 'ccTrigger' as const,
      portId: 'keys',
      channel: 1 as const,
      controller: 7,
      threshold: 64,
      lowVolts: 0,
      highVolts: 5,
    }
    router.configure([mapping])

    expect(router.route({ portId: 'other', bytes: [0xb0, 7, 127] })).toEqual([])
    expect(router.route({ portId: 'keys', bytes: [0xb1, 7, 127] })).toEqual([])
    expect(router.route({ portId: 'keys', bytes: [0xb0, 8, 127] })).toEqual([])
    expect(router.route({ portId: 'keys', bytes: [0xf8] })).toEqual([])
    expect(router.route({ portId: 'keys', bytes: [0x90] })).toEqual([])
    expect(router.route({ portId: 'keys', bytes: [0xb0, 7, 127] })).toEqual([{ index: 0, pulse: 5 }])
    router.setMapping(0, mapping)
    expect(router.route({ portId: 'keys', bytes: [0xb0, 7, 127] })).toEqual([{ index: 0, pulse: 5 }])
  })

  it('selects the correct initial held voltage for each mapping family', () => {
    expect(initialWebMidiInputValue(defaultWebMidiInputMapping('cv'))).toBe(0)
    expect(initialWebMidiInputValue(defaultWebMidiInputMapping('gate'))).toBe(0)
    expect(initialWebMidiInputValue({
      kind: 'notePitch', portId: '', channel: 'omni', baseNote: 60, baseVoltage: 2,
    })).toBe(2)
  })
})
