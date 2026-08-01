import type {
  ArpeggioChord,
  ArpeggioType,
  ClockDivision,
  ExternalInputUpdate,
  FreeformCvPoint,
  GlobalClockConfig,
  InputKind,
  SignalShape,
  SignalSourceConfig,
} from '../types'

export const SIGNAL_SHAPES: ReadonlyArray<{ value: SignalShape; label: string }> = [
  { value: 'manual', label: 'Manual / DC' },
  { value: 'freeform', label: 'Freeform CV' },
  { value: 'sine', label: 'Sine LFO' },
  { value: 'triangle', label: 'Triangle LFO' },
  { value: 'sawUp', label: 'Rising saw' },
  { value: 'sawDown', label: 'Falling saw' },
  { value: 'square', label: 'Bipolar square' },
  { value: 'gate', label: 'Gate / clock' },
  { value: 'trigger', label: 'Trigger pulse' },
  { value: 'gateSequencer', label: 'X-step gate sequencer' },
  { value: 'noteSequencer', label: 'X-step note sequencer (V/Oct)' },
  { value: 'arpeggio', label: 'Arpeggio (V/Oct)' },
  { value: 'sampleHold', label: 'Sample & hold' },
  { value: 'noise', label: 'Noise' },
]

export const CLOCK_DIVISIONS: ReadonlyArray<ClockDivision> = [
  '2 bars',
  '1 bar',
  '1/2',
  '1/4',
  '1/8',
  '1/16',
  '1/32',
]

export const ARPEGGIO_TYPES: ReadonlyArray<{ value: ArpeggioType; label: string }> = [
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
  { value: 'upDown', label: 'Up / down' },
  { value: 'random', label: 'Random' },
]

export const ARPEGGIO_CHORDS: ReadonlyArray<{ value: ArpeggioChord; label: string }> = [
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
  { value: 'fifth', label: 'Fifth' },
  { value: 'major7', label: 'Major 7' },
  { value: 'minor7', label: 'Minor 7' },
]

const BEATS_PER_CYCLE: Record<ClockDivision, number> = {
  '2 bars': 8,
  '1 bar': 4,
  '1/2': 2,
  '1/4': 1,
  '1/8': 0.5,
  '1/16': 0.25,
  '1/32': 0.125,
}

const DEFAULT_TIMING = { mode: 'free', frequencyHz: 1 } as const

export const FREEFORM_CV_MIN_VOLTS = -10
export const FREEFORM_CV_MAX_VOLTS = 10
export const FREEFORM_CV_MAX_POINTS = 64
export const FREEFORM_CV_MIN_PHASE_GAP = 0.001
export const MAX_SEQUENCE_STEPS = 32
export const MIN_NOTE_SEQUENCE_SEMITONES = -120
export const MAX_NOTE_SEQUENCE_SEMITONES = 120
const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11] as const
export const DEFAULT_GATE_SEQUENCE_STEPS: readonly boolean[] = Array.from(
  { length: MAX_SEQUENCE_STEPS },
  (_, index) => index % 2 === 0,
)
export const DEFAULT_NOTE_SEQUENCE_STEPS: readonly number[] = Array.from(
  { length: MAX_SEQUENCE_STEPS },
  (_, index) => {
    const scaleIndex = index % MAJOR_SCALE_INTERVALS.length
    const octave = Math.floor(index / MAJOR_SCALE_INTERVALS.length)
    return octave * 12 + MAJOR_SCALE_INTERVALS[scaleIndex]!
  },
)
export const DEFAULT_FREEFORM_CV_POINTS: readonly FreeformCvPoint[] = [
  { phase: 0, volts: 0 },
  { phase: 1, volts: 0 },
]

export const DEFAULT_CLOCK: GlobalClockConfig = {
  bpm: 120,
  running: true,
}

export function defaultSignalSource(kind: InputKind, index: number): SignalSourceConfig {
  if (kind === 'trigger') {
    return {
      shape: 'trigger',
      timing: { mode: 'clock', division: '1/4' },
      amplitude: 5,
      offset: 0,
      phase: 0,
      pulseWidth: 0.01,
      manualValue: 0,
      seed: index + 1,
      stepCount: 8,
      gateSteps: [...DEFAULT_GATE_SEQUENCE_STEPS],
      noteSteps: [...DEFAULT_NOTE_SEQUENCE_STEPS],
      arpeggioType: 'upDown',
      arpeggioChord: 'major',
      arpeggioOctaves: 2,
      freeformPoints: DEFAULT_FREEFORM_CV_POINTS.map((point) => ({ ...point })),
    }
  }

  if (kind === 'gate') {
    return {
      shape: 'gate',
      timing: { mode: 'clock', division: '1/4' },
      amplitude: 5,
      offset: 0,
      phase: 0,
      pulseWidth: 0.5,
      manualValue: 0,
      seed: index + 1,
      stepCount: 8,
      gateSteps: [...DEFAULT_GATE_SEQUENCE_STEPS],
      noteSteps: [...DEFAULT_NOTE_SEQUENCE_STEPS],
      arpeggioType: 'upDown',
      arpeggioChord: 'major',
      arpeggioOctaves: 2,
      freeformPoints: DEFAULT_FREEFORM_CV_POINTS.map((point) => ({ ...point })),
    }
  }

  return {
    shape: 'manual',
    timing: DEFAULT_TIMING,
    amplitude: 5,
    offset: 0,
    phase: 0,
    pulseWidth: 0.5,
    manualValue: 0,
    seed: index + 1,
    stepCount: 8,
    gateSteps: [...DEFAULT_GATE_SEQUENCE_STEPS],
    noteSteps: [...DEFAULT_NOTE_SEQUENCE_STEPS],
    arpeggioType: 'upDown',
    arpeggioChord: 'major',
    arpeggioOctaves: 2,
    freeformPoints: DEFAULT_FREEFORM_CV_POINTS.map((point) => ({ ...point })),
  }
}

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function limitedFreeformPoints(points: FreeformCvPoint[]) {
  if (points.length <= FREEFORM_CV_MAX_POINTS) return points
  const first = points[0]!
  const last = points.at(-1)!
  const interior = points.slice(1, -1)
  const slots = FREEFORM_CV_MAX_POINTS - 2
  const selected = Array.from({ length: slots }, (_, index) => {
    const sourceIndex = slots === 1
      ? Math.floor(interior.length / 2)
      : Math.round(index * (interior.length - 1) / (slots - 1))
    return interior[sourceIndex]!
  })
  return [first, ...selected, last]
}

export function normalizeFreeformCvPoints(
  points: readonly FreeformCvPoint[] | undefined,
) {
  const byPhase = new Map<number, FreeformCvPoint>()
  for (const point of points ?? []) {
    if (!Number.isFinite(point?.phase) || !Number.isFinite(point?.volts)) continue
    const phase = clamp(point.phase, 0, 1)
    byPhase.set(phase, {
      phase,
      volts: clamp(point.volts, FREEFORM_CV_MIN_VOLTS, FREEFORM_CV_MAX_VOLTS),
    })
  }

  const normalized = [...byPhase.values()].sort((left, right) => left.phase - right.phase)
  if (normalized.length === 0) {
    return DEFAULT_FREEFORM_CV_POINTS.map((point) => ({ ...point }))
  }
  if (normalized[0]?.phase !== 0) {
    normalized.unshift({ phase: 0, volts: normalized[0]!.volts })
  }
  if (normalized.at(-1)?.phase !== 1) {
    normalized.push({ phase: 1, volts: normalized.at(-1)!.volts })
  }
  return limitedFreeformPoints(normalized).map((point) => ({ ...point }))
}

export function freeformCvValueAt(
  points: readonly FreeformCvPoint[],
  phase: number,
) {
  const safePhase = clamp(finite(phase, 0), 0, 1)
  const first = points[0]
  if (!first) return 0
  if (safePhase <= first.phase) return first.volts

  for (let index = 1; index < points.length; index += 1) {
    const right = points[index]!
    if (safePhase > right.phase) continue
    const left = points[index - 1]!
    if (safePhase === right.phase || right.phase === left.phase) return right.volts
    const progress = (safePhase - left.phase) / (right.phase - left.phase)
    return left.volts + (right.volts - left.volts) * progress
  }
  return points.at(-1)?.volts ?? first.volts
}

export function normalizeGateSequenceSteps(
  steps: readonly boolean[] | undefined,
) {
  return DEFAULT_GATE_SEQUENCE_STEPS.map((defaultValue, index) => (
    typeof steps?.[index] === 'boolean' ? steps[index] : defaultValue
  ))
}

export function normalizeNoteSequenceSteps(
  steps: readonly number[] | undefined,
) {
  return DEFAULT_NOTE_SEQUENCE_STEPS.map((defaultValue, index) => clamp(
    Math.round(finite(steps?.[index] ?? defaultValue, defaultValue)),
    MIN_NOTE_SEQUENCE_SEMITONES,
    MAX_NOTE_SEQUENCE_SEMITONES,
  ))
}

export function normalizeSignalSource(config: SignalSourceConfig): SignalSourceConfig {
  const timing = config.timing.mode === 'clock'
    ? { mode: 'clock' as const, division: config.timing.division }
    : { mode: 'free' as const, frequencyHz: Math.max(0.001, finite(config.timing.frequencyHz, 1)) }

  return {
    ...config,
    timing,
    amplitude: Math.max(0, finite(config.amplitude, 5)),
    offset: finite(config.offset, 0),
    phase: ((finite(config.phase, 0) % 1) + 1) % 1,
    pulseWidth: Math.min(0.99, Math.max(0.001, finite(config.pulseWidth, 0.5))),
    manualValue: finite(config.manualValue, 0),
    seed: Math.floor(finite(config.seed, 1)),
    stepCount: Math.min(MAX_SEQUENCE_STEPS, Math.max(1, Math.round(finite(config.stepCount, 8)))),
    gateSteps: normalizeGateSequenceSteps(config.gateSteps),
    noteSteps: normalizeNoteSequenceSteps(config.noteSteps),
    arpeggioType: ARPEGGIO_TYPES.some(({ value }) => value === config.arpeggioType)
      ? config.arpeggioType
      : 'upDown',
    arpeggioChord: ARPEGGIO_CHORDS.some(({ value }) => value === config.arpeggioChord)
      ? config.arpeggioChord
      : 'major',
    arpeggioOctaves: clamp(Math.round(finite(config.arpeggioOctaves, 2)), 1, 4),
    freeformPoints: normalizeFreeformCvPoints(config.freeformPoints),
  }
}

function hashNoise(value: number) {
  let hash = value | 0
  hash = Math.imul(hash ^ (hash >>> 16), 0x21f0aaad)
  hash = Math.imul(hash ^ (hash >>> 15), 0x735a2d97)
  return ((hash ^ (hash >>> 15)) >>> 0) / 0xffffffff
}

function bipolar(config: SignalSourceConfig, normalized: number) {
  return config.offset + config.amplitude * normalized
}

function positiveModulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus
}

const ARPEGGIO_CHORD_INTERVALS: Readonly<Record<ArpeggioChord, readonly number[]>> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  fifth: [0, 7],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
}

function arpeggioInterval(config: SignalSourceConfig, stepIndex: number) {
  const chord = ARPEGGIO_CHORD_INTERVALS[config.arpeggioChord]
  const noteCount = chord.length * config.arpeggioOctaves
  let position: number
  switch (config.arpeggioType) {
    case 'up':
      position = stepIndex
      break
    case 'down':
      position = noteCount - 1 - positiveModulo(stepIndex, noteCount)
      break
    case 'random':
      position = Math.floor(hashNoise(stepIndex + config.seed * 65537) * noteCount)
      break
    case 'upDown': {
      const ascendingSteps = Math.ceil((config.stepCount + 1) / 2)
      position = stepIndex < ascendingSteps
        ? stepIndex
        : config.stepCount - stepIndex
      break
    }
  }
  const boundedPosition = positiveModulo(position, noteCount)
  const chordIndex = boundedPosition % chord.length
  const octave = Math.floor(boundedPosition / chord.length)
  return octave * 12 + chord[chordIndex]!
}

function normalizedSignalValueAt(
  config: SignalSourceConfig,
  clockBeats: number,
  timeSeconds: number,
  step: number,
) {
  if (config.shape === 'manual') return config.manualValue

  const cycle = config.timing.mode === 'clock'
    ? clockBeats / BEATS_PER_CYCLE[config.timing.division] + config.phase
    : timeSeconds * config.timing.frequencyHz + config.phase
  const phase = cycle - Math.floor(cycle)
  const sequenceStep = positiveModulo(Math.floor(cycle), config.stepCount)

  switch (config.shape) {
    case 'freeform':
      return freeformCvValueAt(config.freeformPoints, phase)
    case 'sine':
      return bipolar(config, Math.sin(phase * Math.PI * 2))
    case 'triangle':
      return bipolar(config, 1 - 4 * Math.abs(phase - 0.5))
    case 'sawUp':
      return bipolar(config, phase * 2 - 1)
    case 'sawDown':
      return bipolar(config, 1 - phase * 2)
    case 'square':
      return bipolar(config, phase < config.pulseWidth ? 1 : -1)
    case 'gate':
      return config.offset + (phase < config.pulseWidth ? config.amplitude : 0)
    case 'trigger':
      return config.offset + (phase < config.pulseWidth ? config.amplitude : 0)
    case 'gateSequencer':
      return config.offset + (
        config.gateSteps[sequenceStep] && phase < config.pulseWidth
          ? config.amplitude
          : 0
      )
    case 'noteSequencer':
      return config.offset + config.amplitude * config.noteSteps[sequenceStep]! / 12
    case 'arpeggio':
      return config.offset + config.amplitude * arpeggioInterval(config, sequenceStep) / 12
    case 'sampleHold': {
      const cycleIndex = Math.floor(cycle)
      return bipolar(config, hashNoise(cycleIndex + config.seed * 7919) * 2 - 1)
    }
    case 'noise':
      return bipolar(config, hashNoise(step + config.seed * 104729) * 2 - 1)
  }
}

export function signalValueAt(
  source: SignalSourceConfig,
  clockBeats: number,
  timeSeconds: number,
  step: number,
) {
  return normalizedSignalValueAt(
    normalizeSignalSource(source),
    clockBeats,
    timeSeconds,
    step,
  )
}

export class ClockTransport {
  private state: GlobalClockConfig = { ...DEFAULT_CLOCK }
  private beatPosition = 0

  reset(config: GlobalClockConfig = DEFAULT_CLOCK) {
    this.state = { ...config }
    this.beatPosition = 0
  }

  set(config: GlobalClockConfig) {
    this.state = {
      bpm: Math.min(999, Math.max(1, finite(config.bpm, DEFAULT_CLOCK.bpm))),
      running: config.running,
    }
  }

  advance(seconds: number) {
    if (this.state.running) {
      this.beatPosition += seconds * this.state.bpm / 60
    }
  }

  get config() {
    return { ...this.state }
  }

  get beats() {
    return this.beatPosition
  }
}

export class SignalBank {
  private sources: SignalSourceConfig[] = []
  private external: Array<{
    active: boolean
    heldValue: number
    pulses: number[]
    releasePending: boolean
  }> = []

  configure(kinds: InputKind[], defaults: readonly SignalSourceConfig[] = []) {
    this.sources = kinds.map((kind, index) => normalizeSignalSource(
      defaults[index] ?? defaultSignalSource(kind, index),
    ))
    this.external = kinds.map(() => ({
      active: false,
      heldValue: 0,
      pulses: [],
      releasePending: false,
    }))
  }

  set(index: number, config: SignalSourceConfig) {
    if (index < 0 || index >= this.sources.length) return
    this.sources[index] = normalizeSignalSource(config)
    this.external[index] = {
      active: false,
      heldValue: 0,
      pulses: [],
      releasePending: false,
    }
  }

  setExternal(index: number, value: number) {
    if (index < 0 || index >= this.sources.length) return
    this.external[index] = {
      active: true,
      heldValue: finite(value, 0),
      pulses: [],
      releasePending: false,
    }
  }

  updateExternal(updates: readonly ExternalInputUpdate[]) {
    for (const update of updates) {
      const state = this.external[update.index]
      if (!state?.active) continue
      if (update.value !== undefined && Number.isFinite(update.value)) {
        state.heldValue = update.value
      }
      if (update.pulse !== undefined && Number.isFinite(update.pulse)) {
        state.pulses.push(update.pulse)
      }
    }
  }

  get configs() {
    return this.sources.map((source) => ({
      ...source,
      timing: { ...source.timing },
      gateSteps: [...source.gateSteps],
      noteSteps: [...source.noteSteps],
      freeformPoints: source.freeformPoints.map((point) => ({ ...point })),
    }))
  }

  sample(clock: ClockTransport, timeSeconds: number, step: number) {
    return this.sources.map((source, index) => {
      const state = this.external[index]
      if (!state?.active) {
        return normalizedSignalValueAt(source, clock.beats, timeSeconds, step)
      }
      if (state.releasePending) {
        state.releasePending = false
        return state.heldValue
      }
      const pulse = state.pulses.shift()
      if (pulse !== undefined) {
        state.releasePending = true
        return pulse
      }
      return state.heldValue
    })
  }
}
