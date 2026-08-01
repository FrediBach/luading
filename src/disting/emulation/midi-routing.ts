import {
  DISTING_MIDI_DESTINATION_BITS,
  type DistingMidiDestination,
  type DistingMidiPortAssignments,
} from '../types'

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
