import type {
  AudioRouteDestination,
  OutputAudioRoute,
} from '../emulation/audio-routing'
import type { SynthWaveform } from '../emulation/web-audio'
import type { TracePoint } from '../types'
import type {
  MidiChannel,
  OutputChannelRoute,
  OutputKind,
} from '../types'
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

export function audioDestinationLabel(destination: AudioRouteDestination) {
  return AUDIO_DESTINATIONS.find((option) => option.value === destination)
    ?.shortLabel ?? destination
}

export function emptyOutputRoutes(
  outputCount: number,
  defaults: readonly AudioRouteDestination[] = [],
): OutputChannelRoute[] {
  return Array.from(
    { length: Math.max(0, outputCount) },
    (_, index) => {
      const destination = defaults[index] ?? 'off'
      return destination === 'off'
        ? { kind: 'off' as const }
        : { kind: 'webAudio' as const, destination }
    },
  )
}

export function normalizeOutputRoutes(
  routes: readonly OutputChannelRoute[],
  outputCount: number,
) {
  return Array.from(
    { length: Math.max(0, outputCount) },
    (_, index) => routes[index] ?? { kind: 'off' as const },
  )
}

export function updateOutputRoute(
  routes: readonly OutputChannelRoute[],
  outputCount: number,
  index: number,
  route: OutputChannelRoute,
) {
  const next = normalizeOutputRoutes(routes, outputCount)
  if (index >= 0 && index < next.length) next[index] = route
  return next
}

export function webAudioRoutes(routes: readonly OutputChannelRoute[]): OutputAudioRoute[] {
  return routes.map((route) => ({
    destination: route.kind === 'webAudio' ? route.destination : 'off',
  }))
}

export function defaultWebMidiOutputRoute(
  outputKind: OutputKind,
  portId = '',
): OutputChannelRoute {
  if (outputKind === 'stepped') {
    return {
      kind: 'webMidiNote',
      portId,
      channel: 1,
      source: { kind: 'fixed', note: 60 },
      gateThresholdVolts: 1,
      velocity: 100,
    }
  }
  return {
    kind: 'webMidiCc',
    portId,
    channel: 1,
    controller: 1,
    minimumVolts: 0,
    maximumVolts: 5,
  }
}

export function outputRouteLabel(route: OutputChannelRoute) {
  if (route.kind === 'off') return 'Off'
  if (route.kind === 'webAudio') return `WebAudio · ${audioDestinationLabel(route.destination)}`
  if (route.kind === 'webMidiCc') return `MIDI · CC ${route.controller}`
  if (route.kind === 'webMidiPitchBend') return 'MIDI · Pitch bend'
  const note = route.source.kind === 'fixed'
    ? `note ${route.source.note}`
    : `OUT ${route.source.outputIndex + 1} pitch`
  return `MIDI · ${note}`
}

export function outputRouteWithMidiKind(
  kind: Extract<OutputChannelRoute['kind'], 'webMidiCc' | 'webMidiPitchBend' | 'webMidiNote'>,
  current: OutputChannelRoute,
): OutputChannelRoute {
  const currentMidi = current.kind === 'webMidiCc'
    || current.kind === 'webMidiPitchBend'
    || current.kind === 'webMidiNote'
  const portId = currentMidi ? current.portId : ''
  const channel = (currentMidi ? current.channel : 1) as MidiChannel
  if (kind === 'webMidiCc') {
    return {
      kind,
      portId,
      channel,
      controller: 1,
      minimumVolts: 0,
      maximumVolts: 5,
    }
  }
  if (kind === 'webMidiPitchBend') {
    return { kind, portId, channel, minimumVolts: -5, maximumVolts: 5 }
  }
  return {
    kind: 'webMidiNote',
    portId,
    channel,
    source: { kind: 'fixed', note: 60 },
    gateThresholdVolts: 1,
    velocity: 100,
  }
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
