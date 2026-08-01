import {
  DISTING_MIDI_DESTINATION_BITS,
  type DistingMidiDestination,
  type DistingMidiPortAssignments,
  type ExternalInputUpdate,
  type InputKind,
  type MidiChannelFilter,
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
