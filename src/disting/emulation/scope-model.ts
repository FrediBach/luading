import type { ScopeSource, TracePoint } from '../types'

export type TriggerEdge = 'rising' | 'falling'

export interface TriggerSelection {
  source: ScopeSource
  level: number
  probeIndex: number
}

export interface ScopeWindow {
  points: TracePoint[]
  startTime: number
  endTime: number
  triggerTime: number | null
  locked: boolean
}

export function readTracePoint(point: TracePoint, source: ScopeSource) {
  return source.kind === 'input'
    ? point.inputs[source.index] ?? 0
    : point.outputs[source.index] ?? 0
}

function signalRange(trace: TracePoint[], source: ScopeSource) {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (const point of trace) {
    const value = readTracePoint(point, source)
    min = Math.min(min, value)
    max = Math.max(max, value)
  }

  return {
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 0,
  }
}

export function selectAutomaticTrigger(
  trace: TracePoint[],
  sources: Array<ScopeSource | null>,
): TriggerSelection | null {
  let best: TriggerSelection | null = null
  let bestRange = 0

  sources.forEach((source, probeIndex) => {
    if (!source) return
    const range = signalRange(trace, source)
    const peakToPeak = range.max - range.min
    if (peakToPeak <= bestRange) return

    bestRange = peakToPeak
    best = {
      source,
      level: (range.min + range.max) / 2,
      probeIndex,
    }
  })

  return bestRange > 0.001 ? best : null
}

function crosses(level: number, from: number, to: number, edge: TriggerEdge) {
  return edge === 'rising'
    ? from <= level && to > level
    : from >= level && to < level
}

function interpolatedCrossing(
  before: TracePoint,
  after: TracePoint,
  source: ScopeSource,
  level: number,
) {
  const from = readTracePoint(before, source)
  const to = readTracePoint(after, source)
  const fraction = to === from ? 0 : (level - from) / (to - from)
  return before.time + Math.min(1, Math.max(0, fraction)) * (after.time - before.time)
}

function findLatestTrigger(
  trace: TracePoint[],
  source: ScopeSource,
  edge: TriggerEdge,
  level: number,
  earliestTrigger: number,
  latestTrigger: number,
) {
  for (let index = trace.length - 1; index > 0; index -= 1) {
    const before = trace[index - 1]
    const after = trace[index]
    if (!before || !after || after.time > latestTrigger) continue
    if (after.time < earliestTrigger) break

    const from = readTracePoint(before, source)
    const to = readTracePoint(after, source)
    if (crosses(level, from, to, edge)) {
      return interpolatedCrossing(before, after, source, level)
    }
  }

  return null
}

export function selectScopeWindow(
  trace: TracePoint[],
  durationSeconds: number,
  trigger: TriggerSelection | null,
  edge: TriggerEdge,
  preTriggerRatio = 0.2,
): ScopeWindow {
  const latestTime = trace.at(-1)?.time ?? 0
  const duration = Math.max(0.001, durationSeconds)
  const preTrigger = duration * preTriggerRatio
  const postTrigger = duration - preTrigger
  const earliestTrace = trace[0]?.time ?? 0

  const triggerTime = trigger
    ? findLatestTrigger(
        trace,
        trigger.source,
        edge,
        trigger.level,
        earliestTrace + preTrigger,
        latestTime - postTrigger,
      )
    : null

  const startTime = triggerTime === null
    ? latestTime - duration
    : triggerTime - preTrigger
  const endTime = startTime + duration

  return {
    points: trace.filter((point) => point.time >= startTime && point.time <= endTime),
    startTime,
    endTime,
    triggerTime,
    locked: triggerTime !== null,
  }
}
