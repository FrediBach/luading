import {
  FREEFORM_CV_MAX_POINTS,
  FREEFORM_CV_MAX_VOLTS,
  FREEFORM_CV_MIN_PHASE_GAP,
  FREEFORM_CV_MIN_VOLTS,
  freeformCvValueAt,
} from '../emulation/signal-sources'
import type { FreeformCvPoint } from '../types'

export const FREEFORM_CV_PHASE_STEP = 0.01
export const FREEFORM_CV_PHASE_FINE_STEP = 0.001
export const FREEFORM_CV_VOLTS_STEP = 0.1
export const FREEFORM_CV_VOLTS_FINE_STEP = 0.01

export interface FreeformCvPlotBounds {
  left: number
  top: number
  width: number
  height: number
}

export interface FreeformCvPointEdit {
  points: FreeformCvPoint[]
  selectedIndex: number
  changed: boolean
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function clonePoints(points: readonly FreeformCvPoint[]) {
  return points.map((point) => ({ ...point }))
}

function rounded(value: number) {
  return Number(value.toFixed(6))
}

export function freeformCvPointFromClient(
  clientX: number,
  clientY: number,
  bounds: FreeformCvPlotBounds,
): FreeformCvPoint {
  const unitX = bounds.width > 0
    ? clamp((clientX - bounds.left) / bounds.width, 0, 1)
    : 0
  const unitY = bounds.height > 0
    ? clamp((clientY - bounds.top) / bounds.height, 0, 1)
    : 0.5
  return {
    phase: rounded(unitX),
    volts: rounded(
      FREEFORM_CV_MAX_VOLTS
      - unitY * (FREEFORM_CV_MAX_VOLTS - FREEFORM_CV_MIN_VOLTS),
    ),
  }
}

export function freeformCvPointPosition(
  point: FreeformCvPoint,
  width: number,
  height: number,
) {
  return {
    x: clamp(point.phase, 0, 1) * width,
    y: (
      (FREEFORM_CV_MAX_VOLTS - clamp(
        point.volts,
        FREEFORM_CV_MIN_VOLTS,
        FREEFORM_CV_MAX_VOLTS,
      ))
      / (FREEFORM_CV_MAX_VOLTS - FREEFORM_CV_MIN_VOLTS)
    ) * height,
  }
}

export function freeformCvPath(
  points: readonly FreeformCvPoint[],
  width: number,
  height: number,
) {
  return points.map((point, index) => {
    const position = freeformCvPointPosition(point, width, height)
    return `${index === 0 ? 'M' : 'L'}${position.x.toFixed(2)},${position.y.toFixed(2)}`
  }).join('')
}

export function addFreeformCvPoint(
  points: readonly FreeformCvPoint[],
  point: FreeformCvPoint,
): FreeformCvPointEdit {
  const current = clonePoints(points)
  if (current.length >= FREEFORM_CV_MAX_POINTS) {
    return { points: current, selectedIndex: Math.max(0, current.length - 1), changed: false }
  }

  const targetPhase = clamp(point.phase, FREEFORM_CV_MIN_PHASE_GAP, 1 - FREEFORM_CV_MIN_PHASE_GAP)
  let rightIndex = current.findIndex((candidate) => candidate.phase >= targetPhase)
  if (rightIndex < 1) rightIndex = current.length - 1
  const left = current[rightIndex - 1]
  const right = current[rightIndex]
  if (!left || !right) {
    return { points: current, selectedIndex: 0, changed: false }
  }
  const minimum = left.phase + FREEFORM_CV_MIN_PHASE_GAP
  const maximum = right.phase - FREEFORM_CV_MIN_PHASE_GAP
  if (minimum > maximum) {
    return { points: current, selectedIndex: rightIndex - 1, changed: false }
  }

  current.splice(rightIndex, 0, {
    phase: rounded(clamp(targetPhase, minimum, maximum)),
    volts: rounded(clamp(point.volts, FREEFORM_CV_MIN_VOLTS, FREEFORM_CV_MAX_VOLTS)),
  })
  return { points: current, selectedIndex: rightIndex, changed: true }
}

export function addFreeformCvPointInLargestGap(
  points: readonly FreeformCvPoint[],
): FreeformCvPointEdit {
  const current = clonePoints(points)
  if (current.length >= FREEFORM_CV_MAX_POINTS || current.length < 2) {
    return { points: current, selectedIndex: Math.max(0, current.length - 1), changed: false }
  }

  let leftIndex = 0
  let largestGap = Number.NEGATIVE_INFINITY
  for (let index = 0; index < current.length - 1; index += 1) {
    const gap = current[index + 1]!.phase - current[index]!.phase
    if (gap > largestGap) {
      largestGap = gap
      leftIndex = index
    }
  }
  const phase = (current[leftIndex]!.phase + current[leftIndex + 1]!.phase) / 2
  return addFreeformCvPoint(current, {
    phase,
    volts: freeformCvValueAt(current, phase),
  })
}

export function moveFreeformCvPoint(
  points: readonly FreeformCvPoint[],
  index: number,
  point: FreeformCvPoint,
): FreeformCvPointEdit {
  const current = clonePoints(points)
  const existing = current[index]
  if (!existing) {
    return { points: current, selectedIndex: Math.max(0, current.length - 1), changed: false }
  }
  const boundary = index === 0 || index === current.length - 1
  const minimum = boundary ? existing.phase : current[index - 1]!.phase + FREEFORM_CV_MIN_PHASE_GAP
  const maximum = boundary ? existing.phase : current[index + 1]!.phase - FREEFORM_CV_MIN_PHASE_GAP
  const next = {
    phase: rounded(clamp(point.phase, minimum, maximum)),
    volts: rounded(clamp(point.volts, FREEFORM_CV_MIN_VOLTS, FREEFORM_CV_MAX_VOLTS)),
  }
  const changed = next.phase !== existing.phase || next.volts !== existing.volts
  current[index] = next
  return { points: current, selectedIndex: index, changed }
}

export function removeFreeformCvPoint(
  points: readonly FreeformCvPoint[],
  index: number,
): FreeformCvPointEdit {
  const current = clonePoints(points)
  if (index <= 0 || index >= current.length - 1) {
    return { points: current, selectedIndex: clamp(index, 0, Math.max(0, current.length - 1)), changed: false }
  }
  current.splice(index, 1)
  return {
    points: current,
    selectedIndex: Math.min(index, current.length - 1),
    changed: true,
  }
}

