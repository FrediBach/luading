import type { DistingHardwareEvent } from '../types'

function finiteInteger(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
}

function byte(value: unknown) {
  return Math.min(255, Math.max(0, finiteInteger(value)))
}

function sequence(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return undefined
  const entries = Object.entries(value)
    .map(([key, entry]) => [Number(key), entry] as const)
    .filter(([key]) => Number.isInteger(key) && key >= 1)
    .sort(([left], [right]) => left - right)
  return entries.length > 0 ? entries.map(([, entry]) => entry) : []
}

function dataBytes(values: unknown[]) {
  if (values.length === 1) {
    const table = sequence(values[0])
    if (table) return table.map(byte)
  }
  return values.map(byte)
}

export class DistingHardwareApi {
  private readonly emit: (event: DistingHardwareEvent) => void

  constructor(emit: (event: DistingHardwareEvent) => void) {
    this.emit = emit
  }

  sendI2CCommand(address: unknown, ...data: unknown[]) {
    this.emit({
      kind: 'i2cCommand',
      address: Math.min(127, Math.max(0, finiteInteger(address))),
      bytes: dataBytes(data),
    })
  }

  sendI2CGetter(address: unknown, responseLength: unknown, ...data: unknown[]) {
    const response = Array.from(
      { length: Math.min(256, Math.max(0, finiteInteger(responseLength))) },
      () => 0,
    )
    this.emit({
      kind: 'i2cGetter',
      address: Math.min(127, Math.max(0, finiteInteger(address))),
      bytes: dataBytes(data),
      response,
    })
    return response
  }

  sendMIDI(destinations: unknown, ...data: unknown[]) {
    this.emit({
      kind: 'midiOut',
      destinations: Math.min(15, Math.max(0, finiteInteger(destinations))),
      bytes: dataBytes(data).slice(0, 3),
    })
  }
}
