import { describe, expect, it } from 'vitest'
import type { DistingHardwareEvent } from '../types'
import { DistingHardwareApi } from './hardware-api'

describe('DistingHardwareApi', () => {
  it('captures variadic and table I2C calls with byte clamping', () => {
    const events: DistingHardwareEvent[] = []
    const api = new DistingHardwareApi((event) => events.push(event))

    api.sendI2CCommand(0x32, 0x46, -1, 999)
    api.sendI2CCommand(0x33, { 1: 4, 2: 8 })

    expect(events).toEqual([
      { kind: 'i2cCommand', address: 0x32, bytes: [0x46, 0, 255] },
      { kind: 'i2cCommand', address: 0x33, bytes: [4, 8] },
    ])
  })

  it('returns deterministic zero bytes for hardware getters and captures MIDI output', () => {
    const events: DistingHardwareEvent[] = []
    const api = new DistingHardwareApi((event) => events.push(event))

    expect(api.sendI2CGetter(0x32, 3, [0x48, 7])).toEqual([0, 0, 0])
    api.sendMIDI(0x14, 0x90, 60, 127, 99)

    expect(events[1]).toEqual({
      kind: 'midiOut',
      destinations: 0x0f,
      bytes: [0x90, 60, 127],
    })
  })
})
