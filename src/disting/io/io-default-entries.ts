import type {
  AudioRouteDestination,
  InputKind,
  OutputKind,
  SignalShape,
  SignalSourceConfig,
} from '../types'
import { normalizeFreeformCvPoints } from '../emulation/signal-sources'
import { inputUsesTiming } from './input-source-controls'

const INPUT_CONSTANTS: Record<InputKind, string> = {
  cv: 'kCV',
  gate: 'kGate',
  trigger: 'kTrigger',
}

const OUTPUT_CONSTANTS: Record<OutputKind, string> = {
  stepped: 'kStepped',
  linear: 'kLinear',
}

const INPUT_TYPE_LABELS: Record<SignalShape, string> = {
  manual: 'Manual / DC',
  freeform: 'Freeform CV',
  sine: 'Sine LFO',
  triangle: 'Triangle LFO',
  sawUp: 'Rising Saw',
  sawDown: 'Falling Saw',
  square: 'Bipolar Square',
  gate: 'Gate',
  trigger: 'Trigger',
  gateSequencer: 'Gate Sequencer',
  noteSequencer: 'Note Sequencer (V/Oct)',
  arpeggio: 'Arpeggio (V/Oct)',
  sampleHold: 'Sample & Hold',
  noise: 'Noise',
}

const OUTPUT_TYPE_LABELS: Record<AudioRouteDestination, string> = {
  off: 'Off',
  kick: 'Kick Trigger',
  snare: 'Snare Trigger',
  hat: 'Hi-hat Trigger',
  synthNote: 'Synth Note',
  synthTrigger: 'Synth Trigger',
}

export function inputDefaultEntry(kind: InputKind, source: SignalSourceConfig) {
  const properties = [`Type: ${INPUT_TYPE_LABELS[source.shape]}`]
  if (inputUsesTiming(source)) {
    properties.push(`Synced: ${source.timing.mode === 'clock'}`)
    if (source.timing.mode === 'clock') {
      properties.push(`Division: ${source.timing.division}`)
    }
  }
  if (source.shape === 'freeform') {
    const numberText = (value: number) => Number(value.toFixed(6)).toString()
    const points = normalizeFreeformCvPoints(source.freeformPoints)
    properties.push(`Points: ${points.map((point) => (
      `${numberText(point.phase)}@${numberText(point.volts)}`
    )).join('|')}`)
  }
  return `${INPUT_CONSTANTS[kind]}, -- ${properties.join(', ')}`
}

export function outputDefaultEntry(
  kind: OutputKind,
  destination: AudioRouteDestination,
) {
  return `${OUTPUT_CONSTANTS[kind]}, -- Type: ${OUTPUT_TYPE_LABELS[destination]}`
}
