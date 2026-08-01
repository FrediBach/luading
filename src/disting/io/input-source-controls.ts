import {
  CLOCK_DIVISIONS,
  normalizeFreeformCvPoints,
} from '../emulation/signal-sources'
import type {
  ClockDivision,
  SignalSourceConfig,
  TracePoint,
} from '../types'
import { downsampleTraceChannel } from './trace-values'

export function inputUsesTiming(source: SignalSourceConfig) {
  return source.shape !== 'manual' && source.shape !== 'noise'
}

export function inputUsesPulseWidth(source: SignalSourceConfig) {
  return source.shape === 'square'
    || source.shape === 'gate'
    || source.shape === 'trigger'
    || source.shape === 'gateSequencer'
}

export function inputUsesStepCount(source: SignalSourceConfig) {
  return source.shape === 'gateSequencer'
    || source.shape === 'noteSequencer'
    || source.shape === 'arpeggio'
}

export function inputShapeDefaults(
  source: SignalSourceConfig,
  shape: SignalSourceConfig['shape'],
): SignalSourceConfig {
  const sequenceShape = shape === 'gateSequencer'
    || shape === 'noteSequencer'
    || shape === 'arpeggio'

  return {
    ...source,
    shape,
    stepCount: sequenceShape ? 8 : source.stepCount,
    amplitude: shape === 'noteSequencer' || shape === 'arpeggio'
      ? 1
      : shape === 'gateSequencer'
        ? 5
        : source.amplitude,
    freeformPoints: normalizeFreeformCvPoints(source.freeformPoints),
  }
}

export function inputWithSync(
  source: SignalSourceConfig,
  synced: boolean,
): SignalSourceConfig {
  return {
    ...source,
    timing: synced
      ? { mode: 'clock', division: '1/4' }
      : { mode: 'free', frequencyHz: 1 },
  }
}

export function adjacentClockDivision(
  division: ClockDivision,
  direction: -1 | 1,
) {
  const index = CLOCK_DIVISIONS.indexOf(division)
  const safeIndex = index < 0 ? CLOCK_DIVISIONS.indexOf('1/4') : index
  const nextIndex = Math.min(
    CLOCK_DIVISIONS.length - 1,
    Math.max(0, safeIndex + direction),
  )
  return CLOCK_DIVISIONS[nextIndex] ?? '1/4'
}

export function inputTraceValues(
  trace: readonly TracePoint[],
  inputIndex: number,
  maxPoints = 64,
  windowPoints = 1000,
) {
  return downsampleTraceChannel(
    trace,
    'input',
    inputIndex,
    maxPoints,
    windowPoints,
  )
}

export function inputPlotRange(
  source: SignalSourceConfig,
  values: readonly number[],
) {
  const freeformValues = source.shape === 'freeform'
    ? normalizeFreeformCvPoints(source.freeformPoints).map((point) => point.volts)
    : []
  const sourceMinimum = source.shape === 'manual'
    ? source.manualValue
    : source.shape === 'freeform'
      ? Math.min(...freeformValues)
    : source.shape === 'gate'
      || source.shape === 'trigger'
      || source.shape === 'gateSequencer'
      ? Math.min(source.offset, source.offset + source.amplitude)
      : source.offset - source.amplitude
  const sourceMaximum = source.shape === 'manual'
    ? source.manualValue
    : source.shape === 'freeform'
      ? Math.max(...freeformValues)
    : source.shape === 'gate'
      || source.shape === 'trigger'
      || source.shape === 'gateSequencer'
      ? Math.max(source.offset, source.offset + source.amplitude)
      : source.offset + source.amplitude
  const minimum = Math.min(0, sourceMinimum, ...values)
  const maximum = Math.max(0, sourceMaximum, ...values)
  const span = Math.max(1, maximum - minimum)
  const padding = span * 0.08
  return {
    min: minimum - padding,
    max: maximum + padding,
  }
}

export function inputIsStepped(source: SignalSourceConfig) {
  return source.shape === 'square'
    || source.shape === 'gate'
    || source.shape === 'trigger'
    || source.shape === 'gateSequencer'
    || source.shape === 'noteSequencer'
    || source.shape === 'arpeggio'
    || source.shape === 'sampleHold'
}
