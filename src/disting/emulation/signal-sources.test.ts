import { describe, expect, it } from 'vitest'
import type { SignalSourceConfig } from '../types'
import {
  ClockTransport,
  DEFAULT_FREEFORM_CV_POINTS,
  defaultSignalSource,
  freeformCvValueAt,
  FREEFORM_CV_MAX_POINTS,
  normalizeFreeformCvPoints,
  normalizeSignalSource,
  SignalBank,
  signalValueAt,
} from './signal-sources'

function source(overrides: Partial<SignalSourceConfig> = {}): SignalSourceConfig {
  return {
    shape: 'sine',
    timing: { mode: 'free', frequencyHz: 1 },
    amplitude: 5,
    offset: 0,
    phase: 0,
    pulseWidth: 0.5,
    manualValue: 0,
    seed: 1,
    stepCount: 8,
    freeformPoints: DEFAULT_FREEFORM_CV_POINTS.map((point) => ({ ...point })),
    ...overrides,
  }
}

describe('Disting input signal sources', () => {
  it('creates hardware-appropriate defaults for CV, trigger, and gate inputs', () => {
    expect(defaultSignalSource('cv', 0)).toMatchObject({
      shape: 'manual',
      manualValue: 0,
      seed: 1,
    })
    expect(defaultSignalSource('trigger', 1)).toMatchObject({
      shape: 'trigger',
      timing: { mode: 'clock', division: '1/4' },
      pulseWidth: 0.01,
      seed: 2,
    })
    expect(defaultSignalSource('gate', 2)).toMatchObject({
      shape: 'gate',
      pulseWidth: 0.5,
      seed: 3,
    })
  })

  it('normalizes unsafe source values', () => {
    expect(normalizeSignalSource(source({
      timing: { mode: 'free', frequencyHz: Number.NaN },
      amplitude: -1,
      offset: Number.NaN,
      phase: -1.25,
      pulseWidth: 5,
      manualValue: Number.NaN,
      seed: 3.9,
      stepCount: 100,
    }))).toMatchObject({
      timing: { mode: 'free', frequencyHz: 1 },
      amplitude: 0,
      offset: 0,
      phase: 0.75,
      pulseWidth: 0.99,
      manualValue: 0,
      seed: 3,
      stepCount: 32,
    })
  })

  it('generates the documented CV waveform families', () => {
    expect(signalValueAt(source({ shape: 'manual', manualValue: -2 }), 0, 0.25, 0)).toBe(-2)
    expect(signalValueAt(source({ shape: 'sine' }), 0, 0.25, 0)).toBeCloseTo(5)
    expect(signalValueAt(source({ shape: 'triangle' }), 0, 0.25, 0)).toBeCloseTo(0)
    expect(signalValueAt(source({ shape: 'sawUp' }), 0, 0.25, 0)).toBeCloseTo(-2.5)
    expect(signalValueAt(source({ shape: 'sawDown' }), 0, 0.25, 0)).toBeCloseTo(2.5)
    expect(signalValueAt(source({ shape: 'square' }), 0, 0.25, 0)).toBe(5)
    expect(signalValueAt(source({ shape: 'square' }), 0, 0.75, 0)).toBe(-5)
  })

  it('normalizes freeform CV points into a safe, bounded waveform', () => {
    const input = [
      { phase: 0.75, volts: 15 },
      { phase: Number.NaN, volts: 4 },
      { phase: 0.25, volts: -15 },
      { phase: 0.25, volts: 3 },
    ]
    expect(normalizeFreeformCvPoints(input)).toEqual([
      { phase: 0, volts: 3 },
      { phase: 0.25, volts: 3 },
      { phase: 0.75, volts: 10 },
      { phase: 1, volts: 10 },
    ])
    expect(input).toEqual([
      { phase: 0.75, volts: 15 },
      { phase: Number.NaN, volts: 4 },
      { phase: 0.25, volts: -15 },
      { phase: 0.25, volts: 3 },
    ])
    expect(normalizeFreeformCvPoints([])).toEqual(DEFAULT_FREEFORM_CV_POINTS)

    const oversized = Array.from({ length: 100 }, (_, index) => ({
      phase: index / 99,
      volts: index / 10,
    }))
    const limited = normalizeFreeformCvPoints(oversized)
    expect(limited).toHaveLength(FREEFORM_CV_MAX_POINTS)
    expect(limited[0]?.phase).toBe(0)
    expect(limited.at(-1)?.phase).toBe(1)
  })

  it('interpolates freeform CV points with free, clocked, phase, and seam behavior', () => {
    const points = [
      { phase: 0, volts: -2 },
      { phase: 0.25, volts: 4 },
      { phase: 1, volts: 8 },
    ]
    expect(freeformCvValueAt(points, 0)).toBe(-2)
    expect(freeformCvValueAt(points, 0.25)).toBe(4)
    expect(freeformCvValueAt(points, 0.625)).toBe(6)
    expect(freeformCvValueAt(points, 1)).toBe(8)

    const free = source({ shape: 'freeform', freeformPoints: points })
    expect(signalValueAt(free, 0, 0.25, 0)).toBe(4)
    expect(signalValueAt(free, 0, 1, 0)).toBe(-2)
    expect(signalValueAt(source({
      shape: 'freeform',
      phase: 0.25,
      freeformPoints: points,
    }), 0, 0, 0)).toBe(4)
    expect(signalValueAt(source({
      shape: 'freeform',
      timing: { mode: 'clock', division: '1/4' },
      freeformPoints: points,
    }), 0.25, 0, 0)).toBe(4)
  })

  it('generates clocked gates, triggers, and sequenced V/oct values', () => {
    const clocked = { mode: 'clock' as const, division: '1/4' as const }
    expect(signalValueAt(source({ shape: 'gate', timing: clocked }), 0.25, 0, 0)).toBe(5)
    expect(signalValueAt(source({ shape: 'trigger', timing: clocked, pulseWidth: 0.01 }), 0.02, 0, 0)).toBe(0)
    expect(signalValueAt(source({ shape: 'gateSequencer', timing: clocked }), 0, 0, 0)).toBe(5)
    expect(signalValueAt(source({ shape: 'gateSequencer', timing: clocked }), 1, 0, 0)).toBe(0)
    expect(signalValueAt(source({ shape: 'noteSequencer', timing: clocked, amplitude: 1 }), 1, 0, 0)).toBeCloseTo(2 / 12)
    expect(signalValueAt(source({ shape: 'arpeggio', timing: clocked, amplitude: 1 }), 2, 0, 0)).toBeCloseTo(7 / 12)
  })

  it('keeps sample-and-hold stable per cycle and noise deterministic per step', () => {
    const held = source({ shape: 'sampleHold', seed: 9 })
    const noise = source({ shape: 'noise', seed: 9 })

    expect(signalValueAt(held, 0, 0.1, 10)).toBe(signalValueAt(held, 0, 0.9, 99))
    expect(signalValueAt(held, 0, 0.1, 10)).not.toBe(signalValueAt(held, 0, 1.1, 10))
    expect(signalValueAt(noise, 0, 0, 10)).toBe(signalValueAt(noise, 0, 2, 10))
    expect(signalValueAt(noise, 0, 0, 10)).not.toBe(signalValueAt(noise, 0, 0, 11))
  })

  it('advances and clamps the global clock transport', () => {
    const clock = new ClockTransport()
    clock.set({ bpm: 120, running: true })
    clock.advance(0.5)
    expect(clock.beats).toBe(1)

    clock.set({ bpm: 5000, running: false })
    clock.advance(1)
    expect(clock.beats).toBe(1)
    expect(clock.config).toEqual({ bpm: 999, running: false })

    clock.reset({ bpm: 60, running: true })
    expect(clock.beats).toBe(0)
  })

  it('holds clocked freeform CV when the clock stops while free timing advances', () => {
    const points = [
      { phase: 0, volts: 0 },
      { phase: 0.5, volts: 10 },
      { phase: 1, volts: 0 },
    ]
    const clock = new ClockTransport()
    const bank = new SignalBank()
    clock.set({ bpm: 120, running: false })
    bank.configure(['cv'], [source({
      shape: 'freeform',
      phase: 0.25,
      timing: { mode: 'clock', division: '1/4' },
      freeformPoints: points,
    })])
    expect(bank.sample(clock, 0, 0)).toEqual([5])
    expect(bank.sample(clock, 1, 1000)).toEqual([5])

    bank.set(0, source({
      shape: 'freeform',
      timing: { mode: 'free', frequencyHz: 1 },
      freeformPoints: points,
    }))
    expect(bank.sample(clock, 0.25, 250)).toEqual([5])
    expect(bank.sample(clock, 0.5, 500)).toEqual([10])
  })

  it('configures, updates, samples, and defensively copies signal banks', () => {
    const clock = new ClockTransport()
    const bank = new SignalBank()
    bank.configure(['cv', 'trigger'])
    bank.set(0, source({ shape: 'manual', manualValue: 2 }))
    bank.set(99, source({ shape: 'manual', manualValue: 8 }))

    const configs = bank.configs
    configs[0]!.manualValue = 99
    configs[0]!.freeformPoints[0]!.volts = 99

    expect(bank.sample(clock, 0, 0)).toEqual([2, 5])
    expect(bank.configs[0]?.manualValue).toBe(2)
    expect(bank.configs[0]?.freeformPoints[0]?.volts).toBe(0)
  })

  it('configures a signal bank with supplied simulator defaults', () => {
    const bank = new SignalBank()
    bank.configure(['cv'], [source({
      shape: 'gate',
      timing: { mode: 'clock', division: '1/8' },
    })])

    expect(bank.configs[0]).toMatchObject({
      shape: 'gate',
      timing: { mode: 'clock', division: '1/8' },
    })
  })

  it('holds external values and queues pulses with a low control step between edges', () => {
    const clock = new ClockTransport()
    const bank = new SignalBank()
    bank.configure(['cv', 'trigger'])
    bank.setExternal(0, 1)
    bank.setExternal(1, 0)
    bank.updateExternal([
      { index: 0, value: 2.5 },
      { index: 1, pulse: 5 },
      { index: 1, pulse: 5 },
    ])

    expect(bank.sample(clock, 0, 0)).toEqual([2.5, 5])
    expect(bank.sample(clock, 0.001, 1)).toEqual([2.5, 0])
    expect(bank.sample(clock, 0.002, 2)).toEqual([2.5, 5])
    expect(bank.sample(clock, 0.003, 3)).toEqual([2.5, 0])
  })

  it('resets queued external state when switching input sources', () => {
    const clock = new ClockTransport()
    const bank = new SignalBank()
    bank.configure(['gate'])
    bank.setExternal(0, 0)
    bank.updateExternal([{ index: 0, value: 5 }, { index: 0, pulse: 8 }])
    bank.set(0, source({ shape: 'manual', manualValue: -1 }))

    expect(bank.sample(clock, 0, 0)).toEqual([-1])
    bank.setExternal(0, 3)
    expect(bank.sample(clock, 0.001, 1)).toEqual([3])
  })
})
