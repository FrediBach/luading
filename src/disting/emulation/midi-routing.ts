import {
  DISTING_MIDI_DESTINATION_BITS,
  type DistingMidiDestination,
  type DistingMidiPortAssignments,
  type ExternalInputUpdate,
  type InputKind,
  type MidiChannelFilter,
  type OutputChannelRoute,
  type TracePoint,
  type WebMidiInputMapping,
} from '../types'
import type { WebMidiMessage } from './web-midi'

export const DISTING_MIDI_DESTINATIONS: ReadonlyArray<{
  id: DistingMidiDestination
  bit: number
  label: string
}> = [
  { id: 'breakout', bit: DISTING_MIDI_DESTINATION_BITS.breakout, label: 'MIDI breakout' },
  { id: 'selectBus', bit: DISTING_MIDI_DESTINATION_BITS.selectBus, label: 'Select Bus' },
  { id: 'usb', bit: DISTING_MIDI_DESTINATION_BITS.usb, label: 'USB' },
  { id: 'internal', bit: DISTING_MIDI_DESTINATION_BITS.internal, label: 'Internal' },
]

export const DISTING_MIDI_ALL_DESTINATIONS_MASK = DISTING_MIDI_DESTINATIONS.reduce(
  (mask, destination) => mask | destination.bit,
  0,
)

function destinationMask(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.trunc(value) & DISTING_MIDI_ALL_DESTINATIONS_MASK
}

export function distingMidiDestinationsForMask(mask: number) {
  const normalized = destinationMask(mask)
  return DISTING_MIDI_DESTINATIONS
    .filter((destination) => (normalized & destination.bit) !== 0)
    .map((destination) => destination.id)
}

export function assignedWebMidiOutputIds(
  mask: number,
  assignments: Readonly<DistingMidiPortAssignments>,
) {
  const ids = distingMidiDestinationsForMask(mask)
    .map((destination) => assignments[destination])
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  return [...new Set(ids)]
}

function clampMidiData(value: number | undefined) {
  if (!Number.isFinite(value)) return 0
  return Math.min(127, Math.max(0, Math.trunc(value ?? 0)))
}

function scaleMidiData(value: number, minimum: number, maximum: number, fullScale = 127) {
  return minimum + (maximum - minimum) * value / fullScale
}

function channelMatches(filter: MidiChannelFilter, channel: number) {
  return filter === 'omni' || filter === channel
}

function noteMatches(filter: 'any' | number, note: number) {
  return filter === 'any' || clampMidiData(filter) === note
}

export function defaultWebMidiInputMapping(
  kind: InputKind,
  portId = '',
): WebMidiInputMapping {
  if (kind === 'gate') {
    return {
      kind: 'noteGate',
      portId,
      channel: 'omni',
      note: 'any',
      lowVolts: 0,
      highVolts: 5,
    }
  }
  if (kind === 'trigger') {
    return {
      kind: 'noteTrigger',
      portId,
      channel: 'omni',
      note: 'any',
      lowVolts: 0,
      highVolts: 5,
    }
  }
  return {
    kind: 'cc',
    portId,
    channel: 'omni',
    controller: 1,
    minimumVolts: 0,
    maximumVolts: 5,
  }
}

export function initialWebMidiInputValue(mapping: WebMidiInputMapping) {
  switch (mapping.kind) {
    case 'notePitch':
      return mapping.baseVoltage
    case 'noteGate':
    case 'noteTrigger':
    case 'ccGate':
    case 'ccTrigger':
      return mapping.lowVolts
    case 'cc':
    case 'pitchBend':
    case 'noteVelocity':
      return mapping.minimumVolts
  }
}

type NoteState = Set<number>

export class WebMidiInputRouter {
  private mappings: Array<WebMidiInputMapping | null> = []
  private activeNotes = new Map<number, NoteState>()
  private ccHigh = new Map<number, boolean>()

  configure(mappings: readonly (WebMidiInputMapping | null)[]) {
    this.mappings = [...mappings]
    this.activeNotes.clear()
    this.ccHigh.clear()
  }

  setMapping(index: number, mapping: WebMidiInputMapping | null) {
    if (index < 0) return
    this.mappings[index] = mapping
    this.activeNotes.delete(index)
    this.ccHigh.delete(index)
  }

  route(message: Pick<WebMidiMessage, 'portId' | 'bytes'>): ExternalInputUpdate[] {
    const status = Math.trunc(message.bytes[0] ?? -1)
    if (status < 0x80 || status > 0xef) return []
    const messageType = status & 0xf0
    if (
      (messageType === 0x80
        || messageType === 0x90
        || messageType === 0xb0
        || messageType === 0xe0)
      && message.bytes.length < 3
    ) return []
    const channel = (status & 0x0f) + 1
    const data1 = clampMidiData(message.bytes[1])
    const data2 = clampMidiData(message.bytes[2])
    const noteOn = messageType === 0x90 && data2 > 0
    const noteOff = messageType === 0x80 || (messageType === 0x90 && data2 === 0)
    const updates: ExternalInputUpdate[] = []

    this.mappings.forEach((mapping, index) => {
      if (
        !mapping
        || mapping.portId !== message.portId
        || !channelMatches(mapping.channel, channel)
      ) return

      switch (mapping.kind) {
        case 'cc':
          if (messageType === 0xb0 && data1 === clampMidiData(mapping.controller)) {
            updates.push({
              index,
              value: scaleMidiData(
                data2,
                mapping.minimumVolts,
                mapping.maximumVolts,
              ),
            })
          }
          break
        case 'pitchBend':
          if (messageType === 0xe0) {
            updates.push({
              index,
              value: scaleMidiData(
                data1 + data2 * 128,
                mapping.minimumVolts,
                mapping.maximumVolts,
                16383,
              ),
            })
          }
          break
        case 'notePitch':
          if (noteOn) {
            updates.push({
              index,
              value: mapping.baseVoltage + (data1 - mapping.baseNote) / 12,
            })
          }
          break
        case 'noteVelocity':
          if ((noteOn || noteOff) && noteMatches(mapping.note, data1)) {
            updates.push({
              index,
              value: scaleMidiData(
                noteOn ? data2 : 0,
                mapping.minimumVolts,
                mapping.maximumVolts,
              ),
            })
          }
          break
        case 'noteGate':
          if ((noteOn || noteOff) && noteMatches(mapping.note, data1)) {
            const notes = this.activeNotes.get(index) ?? new Set<number>()
            const noteKey = channel * 128 + data1
            if (noteOn) notes.add(noteKey)
            else notes.delete(noteKey)
            this.activeNotes.set(index, notes)
            updates.push({
              index,
              value: notes.size > 0 ? mapping.highVolts : mapping.lowVolts,
            })
          }
          break
        case 'noteTrigger':
          if (noteOn && noteMatches(mapping.note, data1)) {
            updates.push({ index, pulse: mapping.highVolts })
          }
          break
        case 'ccGate':
          if (messageType === 0xb0 && data1 === clampMidiData(mapping.controller)) {
            updates.push({
              index,
              value: data2 >= clampMidiData(mapping.threshold)
                ? mapping.highVolts
                : mapping.lowVolts,
            })
          }
          break
        case 'ccTrigger':
          if (messageType === 0xb0 && data1 === clampMidiData(mapping.controller)) {
            const high = data2 >= clampMidiData(mapping.threshold)
            const wasHigh = this.ccHigh.get(index) ?? false
            this.ccHigh.set(index, high)
            if (high && !wasHigh) updates.push({ index, pulse: mapping.highVolts })
          }
          break
      }
    })

    return updates
  }
}

export interface WebMidiOutputEvent {
  portId: string
  bytes: number[]
  offsetSeconds: number
}

interface ContinuousOutputState {
  lastValue?: number
  lastTime: number
  pendingValue?: number
}

interface ActiveOutputNote {
  portId: string
  channel: number
  note: number
}

const CONTINUOUS_MIDI_INTERVAL_SECONDS = 0.01

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function finiteVoltage(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function midiChannelStatus(base: number, channel: number) {
  return base | (clamp(Math.round(channel), 1, 16) - 1)
}

function voltageFraction(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum === maximum) return 0
  return clamp((value - minimum) / (maximum - minimum), 0, 1)
}

function quantizedContinuousValue(
  route: Extract<OutputChannelRoute, { kind: 'webMidiCc' | 'webMidiPitchBend' }>,
  voltage: number,
) {
  if (route.kind === 'webMidiCc') {
    return Math.round(voltageFraction(
      voltage,
      route.minimumVolts,
      route.maximumVolts,
    ) * 127)
  }
  return Math.round(voltageFraction(
    voltage,
    route.minimumVolts,
    route.maximumVolts,
  ) * 16383)
}

function continuousMessage(
  route: Extract<OutputChannelRoute, { kind: 'webMidiCc' | 'webMidiPitchBend' }>,
  value: number,
) {
  if (route.kind === 'webMidiCc') {
    return [
      midiChannelStatus(0xb0, route.channel),
      clamp(Math.round(route.controller), 0, 127),
      value,
    ]
  }
  return [
    midiChannelStatus(0xe0, route.channel),
    value & 0x7f,
    (value >> 7) & 0x7f,
  ]
}

function noteForRoute(route: Extract<OutputChannelRoute, { kind: 'webMidiNote' }>, point: TracePoint) {
  if (route.source.kind === 'fixed') {
    return clamp(Math.round(route.source.note), 0, 127)
  }
  const voltage = finiteVoltage(point.outputs[route.source.outputIndex])
  return clamp(Math.round(
    route.source.baseNote + (voltage - route.source.baseVoltage) * 12,
  ), 0, 127)
}

function noteOffEvent(note: ActiveOutputNote, offsetSeconds = 0): WebMidiOutputEvent {
  return {
    portId: note.portId,
    bytes: [midiChannelStatus(0x80, note.channel), note.note, 0],
    offsetSeconds,
  }
}

function routesEqual(left: OutputChannelRoute | undefined, right: OutputChannelRoute | undefined) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export class WebMidiOutputTraceRouter {
  private routes: OutputChannelRoute[] = []
  private previousVoltages: Array<number | undefined> = []
  private continuous = new Map<number, ContinuousOutputState>()
  private activeNotes = new Map<number, ActiveOutputNote>()

  setRoutes(routes: readonly OutputChannelRoute[]) {
    const events: WebMidiOutputEvent[] = []
    const nextRoutes = [...routes]
    const count = Math.max(this.routes.length, nextRoutes.length)
    for (let index = 0; index < count; index += 1) {
      if (routesEqual(this.routes[index], nextRoutes[index])) continue
      const note = this.activeNotes.get(index)
      if (note) events.push(noteOffEvent(note))
      this.activeNotes.delete(index)
      this.continuous.delete(index)
      this.previousVoltages[index] = undefined
    }
    this.routes = nextRoutes
    this.previousVoltages.length = nextRoutes.length
    return events
  }

  process(trace: readonly TracePoint[], availablePortIds?: ReadonlySet<string>) {
    if (trace.length === 0) return []
    const events: WebMidiOutputEvent[] = []
    const firstTime = trace[0]?.time ?? 0

    for (const point of trace) {
      const offsetSeconds = Math.max(0, point.time - firstTime)
      for (let index = 0; index < this.routes.length; index += 1) {
        const route = this.routes[index]
        if (!route || route.kind === 'off' || route.kind === 'webAudio') continue
        if (availablePortIds && !availablePortIds.has(route.portId)) {
          this.previousVoltages[index] = undefined
          this.continuous.delete(index)
          continue
        }
        const voltage = finiteVoltage(point.outputs[index])

        if (route.kind === 'webMidiCc' || route.kind === 'webMidiPitchBend') {
          const value = quantizedContinuousValue(route, voltage)
          const state = this.continuous.get(index) ?? {
            lastTime: Number.NEGATIVE_INFINITY,
          }
          if (value === state.lastValue) state.pendingValue = undefined
          else state.pendingValue = value
          if (
            state.pendingValue !== undefined
            && point.time - state.lastTime >= CONTINUOUS_MIDI_INTERVAL_SECONDS
          ) {
            const bytes = continuousMessage(route, state.pendingValue)
            events.push({ portId: route.portId, bytes, offsetSeconds })
            state.lastValue = state.pendingValue
            state.pendingValue = undefined
            state.lastTime = point.time
          }
          this.continuous.set(index, state)
          continue
        }

        const previous = this.previousVoltages[index]
        const high = voltage >= route.gateThresholdVolts
        const wasHigh = previous !== undefined && previous >= route.gateThresholdVolts
        const active = this.activeNotes.get(index)
        const note = noteForRoute(route, point)

        if (high && active && active.note !== note) {
          events.push(noteOffEvent(active, offsetSeconds))
          const next = { portId: route.portId, channel: route.channel, note }
          events.push({
            portId: route.portId,
            bytes: [
              midiChannelStatus(0x90, route.channel),
              note,
              clamp(Math.round(route.velocity), 1, 127),
            ],
            offsetSeconds,
          })
          this.activeNotes.set(index, next)
        } else if (high && !wasHigh) {
          events.push({
            portId: route.portId,
            bytes: [
              midiChannelStatus(0x90, route.channel),
              note,
              clamp(Math.round(route.velocity), 1, 127),
            ],
            offsetSeconds,
          })
          this.activeNotes.set(index, {
            portId: route.portId,
            channel: route.channel,
            note,
          })
        } else if (!high && wasHigh && active) {
          events.push(noteOffEvent(active, offsetSeconds))
          this.activeNotes.delete(index)
        }
        this.previousVoltages[index] = voltage
      }
    }

    return events
  }

  releaseUnavailable(availablePortIds: ReadonlySet<string>) {
    const events: WebMidiOutputEvent[] = []
    for (const [index, note] of this.activeNotes) {
      if (availablePortIds.has(note.portId)) continue
      events.push(noteOffEvent(note))
      this.activeNotes.delete(index)
      this.previousVoltages[index] = undefined
    }
    return events
  }

  releaseAll() {
    const events = [...this.activeNotes.values()].map((note) => noteOffEvent(note))
    this.activeNotes.clear()
    this.continuous.clear()
    this.previousVoltages = Array.from({ length: this.routes.length })
    return events
  }
}
