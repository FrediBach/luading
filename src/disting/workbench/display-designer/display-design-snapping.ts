import { DISTING_DISPLAY } from '../../types'
import {
  constrainDisplayPointerTranslation,
  displaySelectionBounds,
  translateDisplayElements,
  type DisplayDesignBounds,
  type DisplayDesignClientRect,
  type DisplayDesignPoint,
} from './display-design-geometry'
import type { DisplayDesignDocument } from './display-design-model'

export const DISPLAY_DESIGN_SNAP_ENTER_PX = 6
export const DISPLAY_DESIGN_SNAP_EXIT_PX = 8

export type DisplayDesignSnapAxis = 'x' | 'y'
export type DisplayDesignSnapCandidatePriority = 'leading' | 'trailing' | 'centre'

export interface DisplayDesignSnapCandidate {
  id: string
  coordinate: number
  priority: DisplayDesignSnapCandidatePriority
}

export interface DisplayDesignSnapAxisTarget {
  kind: 'layout-grid'
  axis: DisplayDesignSnapAxis
  candidateId: string
  coordinate: number
}

export interface DisplayDesignSnapState {
  x?: DisplayDesignSnapAxisTarget
  y?: DisplayDesignSnapAxisTarget
}

export interface DisplayDesignSnapGuide {
  kind: 'layout-grid'
  axis: DisplayDesignSnapAxis
  coordinate: number
  label: string
}

export interface DisplayDesignAxisSnapResult {
  correction: number
  target?: DisplayDesignSnapAxisTarget
}

const PRIORITY_ORDER: Record<DisplayDesignSnapCandidatePriority, number> = {
  leading: 0,
  trailing: 1,
  centre: 2,
}

function isRepresentable(value: number, precision: number): boolean {
  return Math.abs(value / precision - Math.round(value / precision)) < 1e-7
}

function axisScale(axis: DisplayDesignSnapAxis, rect: DisplayDesignClientRect): number {
  return axis === 'x'
    ? rect.width / DISTING_DISPLAY.width
    : rect.height / DISTING_DISPLAY.height
}

function nearestGridCoordinate(coordinate: number, size: number, extent: number): number {
  const lastGridCoordinate = Math.floor(extent / size) * size
  return Math.max(0, Math.min(lastGridCoordinate, Math.round(coordinate / size) * size))
}

export function generateDisplayLayoutGridLines(
  size: number,
): { x: number[]; y: number[] } {
  const axis = (extent: number) => {
    const lines: number[] = []
    for (let coordinate = 0; coordinate <= extent; coordinate += size) lines.push(coordinate)
    return lines
  }
  return { x: axis(DISTING_DISPLAY.width), y: axis(DISTING_DISPLAY.height) }
}

export function snapDisplayAxisToLayoutGrid(input: {
  axis: DisplayDesignSnapAxis
  candidates: DisplayDesignSnapCandidate[]
  gridSize: number
  rect: DisplayDesignClientRect
  precision: number
  active?: DisplayDesignSnapAxisTarget
  disabled?: boolean
}): DisplayDesignAxisSnapResult {
  if (input.disabled || input.candidates.length === 0 || input.rect.width <= 0 || input.rect.height <= 0) {
    return { correction: 0 }
  }
  const extent = input.axis === 'x' ? DISTING_DISPLAY.width : DISTING_DISPLAY.height
  const scale = axisScale(input.axis, input.rect)
  const ranked = input.candidates.flatMap((candidate, index) => {
    const coordinate = input.active?.axis === input.axis && input.active.candidateId === candidate.id
      ? input.active.coordinate
      : nearestGridCoordinate(candidate.coordinate, input.gridSize, extent)
    const correction = coordinate - candidate.coordinate
    if (!isRepresentable(correction, input.precision)) return []
    const distance = Math.abs(correction) * scale
    const retaining = input.active?.axis === input.axis
      && input.active.candidateId === candidate.id
      && input.active.coordinate === coordinate
    const threshold = retaining ? DISPLAY_DESIGN_SNAP_EXIT_PX : DISPLAY_DESIGN_SNAP_ENTER_PX
    if (distance > threshold) return []
    return [{ candidate, index, coordinate, correction, distance, retaining }]
  }).sort((left, right) => {
    if (left.retaining !== right.retaining) return left.retaining ? -1 : 1
    return left.distance - right.distance
      || PRIORITY_ORDER[left.candidate.priority] - PRIORITY_ORDER[right.candidate.priority]
      || left.index - right.index
  })
  const winner = ranked[0]
  if (!winner) return { correction: 0 }
  return {
    correction: winner.correction,
    target: {
      kind: 'layout-grid',
      axis: input.axis,
      candidateId: winner.candidate.id,
      coordinate: winner.coordinate,
    },
  }
}

export function snapDisplayPointToLayoutGrid(input: {
  point: DisplayDesignPoint
  gridSize: number
  rect: DisplayDesignClientRect
  precision: number
  active?: DisplayDesignSnapState
  disabled?: boolean
}): { point: DisplayDesignPoint; state: DisplayDesignSnapState; guides: DisplayDesignSnapGuide[] } {
  const x = snapDisplayAxisToLayoutGrid({
    axis: 'x',
    candidates: [{ id: 'point', coordinate: input.point.x, priority: 'leading' }],
    gridSize: input.gridSize,
    rect: input.rect,
    precision: input.precision,
    active: input.active?.x,
    disabled: input.disabled,
  })
  const y = snapDisplayAxisToLayoutGrid({
    axis: 'y',
    candidates: [{ id: 'point', coordinate: input.point.y, priority: 'leading' }],
    gridSize: input.gridSize,
    rect: input.rect,
    precision: input.precision,
    active: input.active?.y,
    disabled: input.disabled,
  })
  const state = { ...(x.target ? { x: x.target } : {}), ...(y.target ? { y: y.target } : {}) }
  return {
    point: { x: input.point.x + x.correction, y: input.point.y + y.correction },
    state,
    guides: snapGuidesFromState(state),
  }
}

function boundsCandidates(bounds: DisplayDesignBounds, axis: DisplayDesignSnapAxis): DisplayDesignSnapCandidate[] {
  return axis === 'x'
    ? [
        { id: 'leading', coordinate: bounds.left, priority: 'leading' },
        { id: 'trailing', coordinate: bounds.right, priority: 'trailing' },
        { id: 'centre', coordinate: (bounds.left + bounds.right) / 2, priority: 'centre' },
      ]
    : [
        { id: 'leading', coordinate: bounds.top, priority: 'leading' },
        { id: 'trailing', coordinate: bounds.bottom, priority: 'trailing' },
        { id: 'centre', coordinate: (bounds.top + bounds.bottom) / 2, priority: 'centre' },
      ]
}

function targetMatchesBounds(target: DisplayDesignSnapAxisTarget, bounds: DisplayDesignBounds): boolean {
  const candidates = boundsCandidates(bounds, target.axis)
  const candidate = candidates.find(({ id }) => id === target.candidateId)
  return Boolean(candidate && Math.abs(candidate.coordinate - target.coordinate) < 1e-7)
}

export function snapDisplaySelectionTranslation(input: {
  document: DisplayDesignDocument
  elementIds: Iterable<string>
  requested: DisplayDesignPoint
  gridSize: number
  rect: DisplayDesignClientRect
  active?: DisplayDesignSnapState
  disabled?: boolean
}): { delta: DisplayDesignPoint; state: DisplayDesignSnapState; guides: DisplayDesignSnapGuide[] } {
  const ids = [...input.elementIds]
  const bounds = displaySelectionBounds(input.document, ids)
  if (!bounds) return { delta: input.requested, state: {}, guides: [] }
  const selected = input.document.elements.filter(({ id }) => ids.includes(id))
  const hasLiteralAxis = (axis: DisplayDesignSnapAxis) => selected.some((element) => {
    if (element.kind === 'line' || element.kind === 'box') {
      return axis === 'x'
        ? element.x1.kind === 'literal' || element.x2.kind === 'literal'
        : element.y1.kind === 'literal' || element.y2.kind === 'literal'
    }
    return (axis === 'x' ? element.x : element.y).kind === 'literal'
  })
  const smoothOnly = selected.length > 0
    && selected.every((element) => (element.kind === 'line' || element.kind === 'circle') && element.smooth)
  const precision = smoothOnly ? 0.5 : 1
  const movedBounds = {
    left: bounds.left + input.requested.x,
    right: bounds.right + input.requested.x,
    top: bounds.top + input.requested.y,
    bottom: bounds.bottom + input.requested.y,
  }
  const x = snapDisplayAxisToLayoutGrid({
    axis: 'x', candidates: hasLiteralAxis('x') ? boundsCandidates(movedBounds, 'x') : [], gridSize: input.gridSize,
    rect: input.rect, precision, active: input.active?.x, disabled: input.disabled,
  })
  const y = snapDisplayAxisToLayoutGrid({
    axis: 'y', candidates: hasLiteralAxis('y') ? boundsCandidates(movedBounds, 'y') : [], gridSize: input.gridSize,
    rect: input.rect, precision, active: input.active?.y, disabled: input.disabled,
  })
  const delta = constrainDisplayPointerTranslation(input.document, ids, {
    x: input.requested.x + x.correction,
    y: input.requested.y + y.correction,
  })
  const finalBounds = displaySelectionBounds(
    translateDisplayElements(input.document, ids, delta.x, delta.y),
    ids,
  ) ?? bounds
  const state = {
    ...(x.target && targetMatchesBounds(x.target, finalBounds) ? { x: x.target } : {}),
    ...(y.target && targetMatchesBounds(y.target, finalBounds) ? { y: y.target } : {}),
  }
  return { delta, state, guides: snapGuidesFromState(state) }
}

export function snapGuidesFromState(state: DisplayDesignSnapState): DisplayDesignSnapGuide[] {
  return [state.x, state.y].flatMap((target) => target
    ? [{ kind: 'layout-grid' as const, axis: target.axis, coordinate: target.coordinate, label: `${target.axis} ${target.coordinate}` }]
    : [])
}
