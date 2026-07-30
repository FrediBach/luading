import { describe, expect, it } from 'vitest'
import type { LoadedProgram, ScopeProbe } from '../types'
import {
  assignScopeSource,
  createDefaultScopeProbes,
  decodeScopeSource,
  downsampleScopeTrace,
  encodeScopeSource,
  scopeAssignmentIntent,
  scopeSourceLabel,
  scopeSourceValue,
} from './scope-controls'

const fullProbes: ScopeProbe[] = [
  { id: 'probe-1', source: { kind: 'input', index: 0 } },
  { id: 'probe-2', source: { kind: 'output', index: 0 } },
  { id: 'probe-3', source: { kind: 'output', index: 1 } },
  { id: 'probe-4', source: { kind: 'output', index: 2 } },
]

describe('scope controls', () => {
  it('assigns an unpatched channel to the first free probe', () => {
    const probes = fullProbes.map((probe, index) => (
      index === 2 ? { ...probe, source: null } : probe
    ))

    expect(scopeAssignmentIntent(
      probes,
      { kind: 'input', index: 2 },
    )).toEqual({ kind: 'assign', probeIndex: 2 })
    expect(scopeAssignmentIntent(
      probes,
      { kind: 'output', index: 0 },
    )).toEqual({ kind: 'focus', probeIndex: 1 })
  })

  it('requires an explicit chooser instead of replacing a full probe bank', () => {
    expect(scopeAssignmentIntent(
      fullProbes,
      { kind: 'input', index: 3 },
    )).toEqual({ kind: 'choose' })
    expect(fullProbes.map((probe) => probe.source)).toEqual([
      { kind: 'input', index: 0 },
      { kind: 'output', index: 0 },
      { kind: 'output', index: 1 },
      { kind: 'output', index: 2 },
    ])
  })

  it('moves duplicate sources and replaces only the explicitly chosen probe', () => {
    expect(assignScopeSource(
      fullProbes,
      3,
      { kind: 'output', index: 0 },
    )).toEqual([
      fullProbes[0],
      { ...fullProbes[1], source: null },
      fullProbes[2],
      { ...fullProbes[3], source: { kind: 'output', index: 0 } },
    ])
  })

  it('creates safe default routing with or without inputs', () => {
    expect(createDefaultScopeProbes(1, 2).map((probe) => probe.source)).toEqual([
      { kind: 'input', index: 0 },
      { kind: 'output', index: 0 },
      { kind: 'output', index: 1 },
      null,
    ])
    expect(createDefaultScopeProbes(0, 2).map((probe) => probe.source)).toEqual([
      { kind: 'output', index: 0 },
      { kind: 'output', index: 1 },
      null,
      null,
    ])
  })

  it('encodes, decodes, labels, and reads probe sources', () => {
    const program: LoadedProgram = {
      name: 'Scope',
      author: 'Test',
      inputCount: 1,
      outputCount: 1,
      inputNames: ['Clock'],
      outputNames: ['Envelope'],
      inputKinds: ['trigger'],
      outputKinds: ['linear'],
      parameters: [],
      customUi: false,
      uiPotPositions: [null, null, null],
    }

    expect(encodeScopeSource({ kind: 'output', index: 0 })).toBe('output:0')
    expect(decodeScopeSource('input:0')).toEqual({ kind: 'input', index: 0 })
    expect(decodeScopeSource('output:-1')).toBeNull()
    expect(decodeScopeSource('bad')).toBeNull()
    expect(scopeSourceLabel({ kind: 'output', index: 0 }, program)).toBe(
      'OUT 1 · Envelope',
    )
    expect(scopeSourceValue({ kind: 'input', index: 0 }, [5], [2])).toBe(5)
  })

  it('bounds scope rendering while preserving routed extrema and endpoints', () => {
    const trace = Array.from({ length: 5000 }, (_, index) => ({
      time: index / 1000,
      inputs: [index === 777 ? 9 : 0],
      outputs: [index === 3222 ? -8 : 0],
    }))
    const sampled = downsampleScopeTrace(
      trace,
      [
        { kind: 'input', index: 0 },
        { kind: 'output', index: 0 },
      ],
      1000,
    )

    expect(sampled.length).toBeLessThanOrEqual(1000)
    expect(sampled[0]).toBe(trace[0])
    expect(sampled.at(-1)).toBe(trace.at(-1))
    expect(sampled.some((point) => point.inputs[0] === 9)).toBe(true)
    expect(sampled.some((point) => point.outputs[0] === -8)).toBe(true)
  })
})
