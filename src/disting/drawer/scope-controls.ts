import type {
  LoadedProgram,
  ScopeProbe,
  ScopeSource,
} from '../types'

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
