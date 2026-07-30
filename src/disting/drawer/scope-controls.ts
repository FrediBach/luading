import type {
  LoadedProgram,
  ScopeProbe,
  ScopeSource,
  TracePoint,
} from '../types'
import { readTracePoint } from '../emulation/scope-model'

export function scopeSourcesEqual(
  left: ScopeSource | null,
  right: ScopeSource | null,
) {
  return left !== null
    && right !== null
    && left.kind === right.kind
    && left.index === right.index
}

export function assignedProbeIndex(
  probes: readonly ScopeProbe[],
  source: ScopeSource,
) {
  return probes.findIndex((probe) => scopeSourcesEqual(probe.source, source))
}

export function firstFreeProbeIndex(probes: readonly ScopeProbe[]) {
  const index = probes.findIndex((probe) => probe.source === null)
  return index >= 0 ? index : null
}

export type ScopeAssignmentIntent =
  | { kind: 'focus'; probeIndex: number }
  | { kind: 'assign'; probeIndex: number }
  | { kind: 'choose' }

export function scopeAssignmentIntent(
  probes: readonly ScopeProbe[],
  source: ScopeSource,
): ScopeAssignmentIntent {
  const assignedIndex = assignedProbeIndex(probes, source)
  if (assignedIndex >= 0) {
    return { kind: 'focus', probeIndex: assignedIndex }
  }
  const freeIndex = firstFreeProbeIndex(probes)
  return freeIndex === null
    ? { kind: 'choose' }
    : { kind: 'assign', probeIndex: freeIndex }
}

export function assignScopeSource(
  probes: readonly ScopeProbe[],
  probeIndex: number,
  source: ScopeSource | null,
) {
  if (probeIndex < 0 || probeIndex >= probes.length) return [...probes]

  return probes.map((probe, index) => {
    if (index === probeIndex) return { ...probe, source }
    if (source && scopeSourcesEqual(probe.source, source)) {
      return { ...probe, source: null }
    }
    return probe
  })
}

export function createDefaultScopeProbes(
  inputCount: number,
  outputCount: number,
  probeCount = 4,
): ScopeProbe[] {
  const sources: ScopeSource[] = []
  if (inputCount > 0) sources.push({ kind: 'input', index: 0 })
  for (
    let outputIndex = 0;
    outputIndex < outputCount && sources.length < probeCount;
    outputIndex += 1
  ) {
    sources.push({ kind: 'output', index: outputIndex })
  }

  return Array.from({ length: probeCount }, (_, index) => ({
    id: `probe-${index + 1}`,
    source: sources[index] ?? null,
  }))
}

export function encodeScopeSource(source: ScopeSource | null) {
  return source ? `${source.kind}:${source.index}` : ''
}

export function decodeScopeSource(value: string): ScopeSource | null {
  if (!value) return null
  const [kind, rawIndex] = value.split(':')
  const index = Number(rawIndex)
  if (
    (kind !== 'input' && kind !== 'output')
    || !Number.isInteger(index)
    || index < 0
  ) {
    return null
  }
  return { kind, index }
}

export function scopeSourceLabel(
  source: ScopeSource | null,
  program: LoadedProgram | null,
) {
  if (!source || !program) return 'Unpatched'
  return source.kind === 'input'
    ? `IN ${source.index + 1} · ${
      program.inputNames[source.index] ?? `Input ${source.index + 1}`
    }`
    : `OUT ${source.index + 1} · ${
      program.outputNames[source.index] ?? `Output ${source.index + 1}`
    }`
}

export function scopeSourceValue(
  source: ScopeSource | null,
  inputs: readonly number[],
  outputs: readonly number[],
) {
  if (!source) return 0
  return source.kind === 'input'
    ? inputs[source.index] ?? 0
    : outputs[source.index] ?? 0
}

export function downsampleScopeTrace(
  trace: readonly TracePoint[],
  sources: readonly (ScopeSource | null)[],
  maxPoints: number,
) {
  if (maxPoints <= 0 || trace.length === 0) return []
  if (trace.length <= maxPoints) return trace
  if (maxPoints === 1) return [trace[trace.length - 1]!]

  const activeSources = sources.filter(
    (source): source is ScopeSource => source !== null,
  )
  if (activeSources.length === 0 || maxPoints < 4) {
    return Array.from({ length: maxPoints }, (_, index) => (
      trace[Math.round(index * (trace.length - 1) / (maxPoints - 1))]!
    ))
  }

  const result: TracePoint[] = [trace[0]!]
  const interiorLength = trace.length - 2
  const bucketCount = Math.max(1, Math.floor((maxPoints - 2) / 2))

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = 1 + Math.floor(bucket * interiorLength / bucketCount)
    const end = 1 + Math.floor((bucket + 1) * interiorLength / bucketCount)
    let minimum = Number.POSITIVE_INFINITY
    let maximum = Number.NEGATIVE_INFINITY
    let minimumIndex = start
    let maximumIndex = start

    for (let index = start; index < end; index += 1) {
      const point = trace[index]
      if (!point) continue
      for (const source of activeSources) {
        const value = readTracePoint(point, source)
        if (value < minimum) {
          minimum = value
          minimumIndex = index
        }
        if (value > maximum) {
          maximum = value
          maximumIndex = index
        }
      }
    }

    if (minimumIndex === maximumIndex) {
      result.push(trace[minimumIndex]!)
    } else if (minimumIndex < maximumIndex) {
      result.push(trace[minimumIndex]!, trace[maximumIndex]!)
    } else {
      result.push(trace[maximumIndex]!, trace[minimumIndex]!)
    }
  }

  result.push(trace[trace.length - 1]!)
  return result.slice(0, maxPoints)
}
