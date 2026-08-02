import { describe, expect, it } from 'vitest'
import type { LoadedProgram, ScopeProbe } from '../types'
import {
  assignScopeSource,
  captureScopeFrame,
  createDefaultScopeProbes,
  decodeScopeSource,
  downsampleScopeTrace,
  encodeScopeSource,
  scopeAssignmentIntent,
  scopeSourceLabel,
  scopeSourceName,
  scopeSourceShortLabel,
  scopeSourceValue,
} from './scope-controls'

const fullProbes: ScopeProbe[] = [
  { id: 'probe-1', source: { kind: 'input', index: 0 } },
  { id: 'probe-2', source: { kind: 'output', index: 0 } },
  { id: 'probe-3', source: { kind: 'output', index: 1 } },
  { id: 'probe-4', source: { kind: 'output', index: 2 } },
]

describe('scope controls', () => {
  it('captures an immutable time slice for paused inspection', () => {
    const trace = [{ time: 1, clockBeats: 2, inputs: [2], outputs: [3] }]
    const inputs = [4]
    const outputs = [5]
    const captured = captureScopeFrame(trace, inputs, outputs)

    trace[0]!.time = 2
    trace[0]!.inputs[0] = 6
    trace.push({ time: 3, clockBeats: 6, inputs: [7], outputs: [8] })
    inputs[0] = 9
    outputs[0] = 10

    expect(captured).toEqual({
      trace: [{ time: 1, clockBeats: 2, inputs: [2], outputs: [3] }],
      inputs: [4],
      outputs: [5],
    })
  })

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
    expect(scopeSourceShortLabel({ kind: 'input', index: 0 })).toBe('IN 1')
    expect(scopeSourceShortLabel({ kind: 'output', index: 0 })).toBe('OUT 1')
    expect(scopeSourceName({ kind: 'output', index: 0 }, program)).toBe('Envelope')
    expect(scopeSourceValue({ kind: 'input', index: 0 }, [5], [2])).toBe(5)
  })

  it('bounds scope rendering while preserving routed extrema and endpoints', () => {
    const trace = Array.from({ length: 5000 }, (_, index) => ({
      time: index / 1000,
      clockBeats: index / 500,
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
