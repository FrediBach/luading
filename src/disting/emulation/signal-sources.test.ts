import { describe, expect, it } from 'vitest'
import type { SignalSourceConfig } from '../types'
import {
  ClockTransport,
  defaultSignalSource,
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

  it('configures, updates, samples, and defensively copies signal banks', () => {
    const clock = new ClockTransport()
    const bank = new SignalBank()
    bank.configure(['cv', 'trigger'])
    bank.set(0, source({ shape: 'manual', manualValue: 2 }))
    bank.set(99, source({ shape: 'manual', manualValue: 8 }))

    const configs = bank.configs
    configs[0]!.manualValue = 99

    expect(bank.sample(clock, 0, 0)).toEqual([2, 5])
    expect(bank.configs[0]?.manualValue).toBe(2)
  })
})
