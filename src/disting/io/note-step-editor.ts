import {
  MAX_NOTE_SEQUENCE_SEMITONES,
  MIN_NOTE_SEQUENCE_SEMITONES,
} from '../emulation/signal-sources'

const NOTE_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F',
  'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const

const NATURAL_SEMITONES: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

export function formatSequenceNote(semitones: number) {
  const rounded = Math.round(semitones)
  const pitchClass = ((rounded % 12) + 12) % 12
  const octave = Math.floor(rounded / 12)
  return `${NOTE_NAMES[pitchClass]}${octave}`
}

export function parseSequenceNote(text: string) {
  const trimmed = text.trim()
  if (/^[+-]?\d+$/.test(trimmed)) {
    const semitones = Number(trimmed)
    return semitones >= MIN_NOTE_SEQUENCE_SEMITONES
      && semitones <= MAX_NOTE_SEQUENCE_SEMITONES
      ? semitones
      : null
  }

  const match = trimmed.match(/^([a-gA-G])([#♯b♭]?)(-?\d+)$/)
  if (!match) return null
  const natural = NATURAL_SEMITONES[match[1]!.toUpperCase()]
  if (natural === undefined) return null
  const accidental = match[2] === '#' || match[2] === '♯'
    ? 1
    : match[2] === 'b' || match[2] === '♭'
      ? -1
      : 0
  const semitones = Number(match[3]) * 12 + natural + accidental
  return semitones >= MIN_NOTE_SEQUENCE_SEMITONES
    && semitones <= MAX_NOTE_SEQUENCE_SEMITONES
    ? semitones
    : null
}
