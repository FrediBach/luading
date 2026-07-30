import type {
  AudioRouteDestination,
  OutputAudioRoute,
} from '../emulation/audio-routing'
import type { SynthWaveform } from '../emulation/web-audio'
import type { TracePoint } from '../types'
import { downsampleTraceChannel } from './trace-values'

export const AUDIO_DESTINATIONS: ReadonlyArray<{
  value: AudioRouteDestination
  label: string
  shortLabel: string
  description: string
}> = [
  {
    value: 'off',
    label: 'Not connected',
    shortLabel: 'Audio off',
    description: 'Do not send this output to WebAudio.',
  },
  {
    value: 'kick',
    label: 'Kick trigger',
    shortLabel: 'Kick',
    description: 'Fire a synthesized kick on a 1 V rising edge.',
  },
  {
    value: 'snare',
    label: 'Snare trigger',
    shortLabel: 'Snare',
    description: 'Fire a synthesized snare on a 1 V rising edge.',
  },
  {
    value: 'hat',
    label: 'Hi-hat trigger',
    shortLabel: 'Hi-hat',
    description: 'Fire a synthesized hi-hat on a 1 V rising edge.',
  },
  {
    value: 'synthNote',
    label: 'Synth note · V/oct',
    shortLabel: 'Synth note',
    description: 'Use 0 V = C3 and quantize V/oct changes to semitones.',
  },
  {
    value: 'synthTrigger',
    label: 'Synth trigger',
    shortLabel: 'Synth trigger',
    description: 'Fire the synth voice on a 1 V rising edge.',
  },
]

export const SYNTH_WAVEFORMS: ReadonlyArray<{
  value: SynthWaveform
  label: string
}> = [
  { value: 'sawtooth', label: 'Saw' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'sine', label: 'Sine' },
]

export function emptyOutputAudioRoutes(outputCount: number): OutputAudioRoute[] {
  return Array.from(
    { length: Math.max(0, outputCount) },
    () => ({ destination: 'off' }),
  )
}

export function normalizeOutputAudioRoutes(
  routes: readonly OutputAudioRoute[],
  outputCount: number,
) {
  return Array.from(
    { length: Math.max(0, outputCount) },
    (_, index) => routes[index] ?? { destination: 'off' as const },
  )
}

export function updateOutputAudioRoute(
  routes: readonly OutputAudioRoute[],
  outputCount: number,
  index: number,
  destination: AudioRouteDestination,
) {
  const next = normalizeOutputAudioRoutes(routes, outputCount)
  if (index >= 0 && index < next.length) next[index] = { destination }
  return next
}

export function audioDestinationLabel(destination: AudioRouteDestination) {
  return AUDIO_DESTINATIONS.find((option) => option.value === destination)
    ?.shortLabel ?? destination
}

export function outputTraceValues(
  trace: readonly TracePoint[],
  outputIndex: number,
  windowPoints = 1000,
  maxPoints = 64,
) {
  return downsampleTraceChannel(
    trace,
    'output',
    outputIndex,
    maxPoints,
    windowPoints,
  )
}

export function outputPlotRange(values: readonly number[]) {
  const minimum = Math.min(0, ...values)
  const maximum = Math.max(0, ...values)
  const span = Math.max(1, maximum - minimum)
  const padding = span * 0.08
  return {
    min: minimum - padding,
    max: maximum + padding,
  }
}
