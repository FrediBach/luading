import { fontAtlas, measureDistingText } from '../../emulation/display-font'
import { DISTING_DISPLAY } from '../../types'
import {
  cloneDisplayDesign,
  createDefaultDisplayPrimitive,
  type DisplayDesignDocumentV1,
  type DisplayDesignElement,
  type DisplayDesignIdFactory,
  type DisplayMode,
  type DisplayPrimitiveElement,
  type DisplayPrimitivePreset,
  type DisplayScalar,
} from './display-design-model'
import { createDisplayBindingMap, resolveDisplayScalar, resolveDisplayText } from './display-design-resolution'

export interface DisplayDesignPoint { x: number; y: number }
export interface DisplayDesignBounds { left: number; top: number; right: number; bottom: number }
export interface DisplayDesignClientRect { left: number; top: number; width: number; height: number }
export type DisplayDesignHandle = 'start' | 'end' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'centre' | 'radius' | 'anchor'
export type DisplayDesignAlignment = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom'
export type DisplayDesignDistribution = 'horizontal' | 'vertical'

const literal = (value: number): DisplayScalar => ({ kind: 'literal', value })

export function logicalToClient(point: DisplayDesignPoint, rect: DisplayDesignClientRect): DisplayDesignPoint {
  return {
    x: rect.left + point.x * rect.width / DISTING_DISPLAY.width,
    y: rect.top + point.y * rect.height / DISTING_DISPLAY.height,
  }
}

export function clientToLogical(point: DisplayDesignPoint, rect: DisplayDesignClientRect): DisplayDesignPoint {
  return {
    x: (point.x - rect.left) * DISTING_DISPLAY.width / rect.width,
    y: (point.y - rect.top) * DISTING_DISPLAY.height / rect.height,
  }
}

export function screenTargetToLogical(screenPixels: number, rect: DisplayDesignClientRect): DisplayDesignPoint {
  return {
    x: screenPixels * DISTING_DISPLAY.width / rect.width,
    y: screenPixels * DISTING_DISPLAY.height / rect.height,
  }
}

export function snapDisplayCoordinate(value: number, smooth: boolean): number {
  return smooth ? Math.round(value * 2) / 2 : Math.round(value)
}

export function constrainDisplayCreationPoint(
  point: DisplayDesignPoint,
  displayMode: DisplayMode,
  smooth: boolean,
): DisplayDesignPoint {
  const minimumY = displayMode === 'parameter-line' ? 10 : 0
  return {
    x: Math.min(DISTING_DISPLAY.width - 1, Math.max(0, snapDisplayCoordinate(point.x, smooth))),
    y: Math.min(DISTING_DISPLAY.height - 1, Math.max(minimumY, snapDisplayCoordinate(point.y, smooth))),
  }
}

export function createDisplayPrimitiveFromGesture(
  preset: DisplayPrimitivePreset,
  startPoint: DisplayDesignPoint,
  endPoint: DisplayDesignPoint,
  displayMode: DisplayMode,
  idFactory: DisplayDesignIdFactory,
): DisplayPrimitiveElement {
  const smooth = preset === 'smooth-line' || preset === 'smooth-circle'
  const start = constrainDisplayCreationPoint(startPoint, displayMode, smooth)
  const end = constrainDisplayCreationPoint(endPoint, displayMode, smooth)
  const element = createDefaultDisplayPrimitive(preset, idFactory)
  if (element.kind === 'line' || element.kind === 'box') {
    return { ...element, x1: literal(start.x), y1: literal(start.y), x2: literal(end.x), y2: literal(end.y) }
  }
  if (element.kind === 'circle') {
    const radius = snapDisplayCoordinate(Math.hypot(end.x - start.x, end.y - start.y), element.smooth)
    return { ...element, x: literal(start.x), y: literal(start.y), radius: literal(radius) }
  }
  return { ...element, x: literal(start.x), y: literal(start.y) }
}

function resolvedScalar(value: DisplayScalar, document?: DisplayDesignDocumentV1): number {
  if (value.kind === 'literal') return value.value
  return resolveDisplayScalar(value, createDisplayBindingMap(document?.bindings ?? []))
}

export function displayElementBounds(
  element: DisplayDesignElement,
  document?: DisplayDesignDocumentV1,
): DisplayDesignBounds {
  const scalar = (value: DisplayScalar) => resolvedScalar(value, document)
  if (element.kind === 'symbol-instance') {
    const x = scalar(element.x)
    const y = scalar(element.y)
    return { left: x, top: y, right: x, bottom: y }
  }
  if (element.kind === 'line' || element.kind === 'box') {
    const x1 = scalar(element.x1); const y1 = scalar(element.y1)
    const x2 = scalar(element.x2); const y2 = scalar(element.y2)
    return { left: Math.min(x1, x2), top: Math.min(y1, y2), right: Math.max(x1, x2), bottom: Math.max(y1, y2) }
  }
  if (element.kind === 'circle') {
    const x = scalar(element.x); const y = scalar(element.y); const radius = scalar(element.radius)
    return { left: x - radius, top: y - radius, right: x + radius, bottom: y + radius }
  }
  const bindings = createDisplayBindingMap(document?.bindings ?? [])
  const x = scalar(element.x); const baseline = scalar(element.y)
  const text = resolveDisplayText(element.text, bindings)
  const width = Math.max(1, measureDistingText(text, element.tiny))
  const font = fontAtlas(element.tiny)
  const left = element.align === 'right' ? x - width : element.align === 'centre' ? Math.round(x - width / 2) : x
  return { left, top: baseline - font.ascent, right: left + width - 1, bottom: baseline + font.descent }
}

export function displaySelectionBounds(
  document: DisplayDesignDocumentV1,
  elementIds: Iterable<string>,
): DisplayDesignBounds | undefined {
  const selected = new Set(elementIds)
  const bounds = document.elements.filter(({ id }) => selected.has(id)).map((element) => displayElementBounds(element, document))
  if (bounds.length === 0) return undefined
  return {
    left: Math.min(...bounds.map(({ left }) => left)),
    top: Math.min(...bounds.map(({ top }) => top)),
    right: Math.max(...bounds.map(({ right }) => right)),
    bottom: Math.max(...bounds.map(({ bottom }) => bottom)),
  }
}

export function displayElementHandles(element: DisplayDesignElement, document?: DisplayDesignDocumentV1): Array<{ id: DisplayDesignHandle; point: DisplayDesignPoint }> {
  const scalar = (value: DisplayScalar) => resolvedScalar(value, document)
  if (element.kind === 'line') return [
    { id: 'start', point: { x: scalar(element.x1), y: scalar(element.y1) } },
    { id: 'end', point: { x: scalar(element.x2), y: scalar(element.y2) } },
  ]
  if (element.kind === 'box') {
    const bounds = displayElementBounds(element, document)
    return [
      { id: 'top-left', point: { x: bounds.left, y: bounds.top } },
      { id: 'top-right', point: { x: bounds.right, y: bounds.top } },
      { id: 'bottom-left', point: { x: bounds.left, y: bounds.bottom } },
      { id: 'bottom-right', point: { x: bounds.right, y: bounds.bottom } },
    ]
  }
  if (element.kind === 'circle') {
    const x = scalar(element.x); const y = scalar(element.y); const radius = scalar(element.radius)
    return [{ id: 'centre', point: { x, y } }, { id: 'radius', point: { x: x + radius, y } }]
  }
  const x = scalar(element.x); const y = scalar(element.y)
  return [{ id: 'anchor', point: { x, y } }]
}

function distanceToSegment(point: DisplayDesignPoint, start: DisplayDesignPoint, end: DisplayDesignPoint): number {
  const dx = end.x - start.x; const dy = end.y - start.y
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const amount = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.x - (start.x + amount * dx), point.y - (start.y + amount * dy))
}

export function displayElementHitTest(
  element: DisplayDesignElement,
  point: DisplayDesignPoint,
  tolerance: number,
  document?: DisplayDesignDocumentV1,
): boolean {
  if (element.kind === 'line') {
    const [start, end] = displayElementHandles(element, document)
    return distanceToSegment(point, start.point, end.point) <= tolerance
  }
  const bounds = displayElementBounds(element, document)
  if (element.kind === 'circle') {
    const x = resolvedScalar(element.x, document); const y = resolvedScalar(element.y, document)
    const distance = Math.hypot(point.x - x, point.y - y)
    return Math.abs(distance - resolvedScalar(element.radius, document)) <= tolerance || distance <= tolerance
  }
  if (element.kind === 'box' && !element.fill) {
    const insideExpanded = point.x >= bounds.left - tolerance && point.x <= bounds.right + tolerance && point.y >= bounds.top - tolerance && point.y <= bounds.bottom + tolerance
    const awayFromEdge = point.x > bounds.left + tolerance && point.x < bounds.right - tolerance && point.y > bounds.top + tolerance && point.y < bounds.bottom - tolerance
    return insideExpanded && !awayFromEdge
  }
  return point.x >= bounds.left - tolerance && point.x <= bounds.right + tolerance && point.y >= bounds.top - tolerance && point.y <= bounds.bottom + tolerance
}

export function hitTestDisplayElements(
  document: DisplayDesignDocumentV1,
  point: DisplayDesignPoint,
  tolerance: number,
): string | undefined {
  return [...document.elements].reverse().find((element) => displayElementHitTest(element, point, tolerance, document))?.id
}

function translateScalar(value: DisplayScalar, delta: number): DisplayScalar {
  return value.kind === 'literal' ? literal(value.value + delta) : cloneDisplayDesign(value)
}

export function translateDisplayElement(element: DisplayDesignElement, dx: number, dy: number): DisplayDesignElement {
  if (element.kind === 'line' || element.kind === 'box') return {
    ...cloneDisplayDesign(element),
    x1: translateScalar(element.x1, dx), y1: translateScalar(element.y1, dy),
    x2: translateScalar(element.x2, dx), y2: translateScalar(element.y2, dy),
  }
  return { ...cloneDisplayDesign(element), x: translateScalar(element.x, dx), y: translateScalar(element.y, dy) }
}

export function translateDisplayElements(
  document: DisplayDesignDocumentV1,
  elementIds: Iterable<string>,
  dx: number,
  dy: number,
): DisplayDesignDocumentV1 {
  const selected = new Set(elementIds)
  return { ...cloneDisplayDesign(document), elements: document.elements.map((element) => selected.has(element.id) ? translateDisplayElement(element, dx, dy) : cloneDisplayDesign(element)) }
}

export function constrainDisplayPointerTranslation(
  document: DisplayDesignDocumentV1,
  elementIds: Iterable<string>,
  requested: DisplayDesignPoint,
): DisplayDesignPoint {
  const bounds = displaySelectionBounds(document, elementIds)
  if (!bounds) return requested
  const minimumY = document.displayMode === 'parameter-line' ? 10 : 0
  if (bounds.top < minimumY || bounds.bottom >= DISTING_DISPLAY.height) return requested
  const minimumDelta = minimumY - bounds.top
  const maximumDelta = DISTING_DISPLAY.height - 1 - bounds.bottom
  return {
    x: requested.x,
    y: minimumDelta <= maximumDelta ? Math.min(maximumDelta, Math.max(minimumDelta, requested.y)) : requested.y,
  }
}

export function resizeDisplayElement(
  element: DisplayDesignElement,
  handle: DisplayDesignHandle,
  point: DisplayDesignPoint,
): DisplayDesignElement {
  if (element.kind === 'symbol-instance') return cloneDisplayDesign(element)
  const smooth = (element.kind === 'line' || element.kind === 'circle') && element.smooth
  const x = snapDisplayCoordinate(point.x, smooth); const y = snapDisplayCoordinate(point.y, smooth)
  if (element.kind === 'line') {
    if (handle === 'start') return { ...cloneDisplayDesign(element), x1: literal(x), y1: literal(y) }
    if (handle === 'end') return { ...cloneDisplayDesign(element), x2: literal(x), y2: literal(y) }
  }
  if (element.kind === 'box') {
    const bounds = displayElementBounds(element)
    if (handle === 'top-left') return { ...cloneDisplayDesign(element), x1: literal(x), y1: literal(y), x2: literal(bounds.right), y2: literal(bounds.bottom) }
    if (handle === 'top-right') return { ...cloneDisplayDesign(element), x1: literal(bounds.left), y1: literal(y), x2: literal(x), y2: literal(bounds.bottom) }
    if (handle === 'bottom-left') return { ...cloneDisplayDesign(element), x1: literal(x), y1: literal(bounds.top), x2: literal(bounds.right), y2: literal(y) }
    if (handle === 'bottom-right') return { ...cloneDisplayDesign(element), x1: literal(bounds.left), y1: literal(bounds.top), x2: literal(x), y2: literal(y) }
  }
  if (element.kind === 'circle') {
    if (handle === 'centre') return { ...cloneDisplayDesign(element), x: literal(x), y: literal(y) }
    if (handle === 'radius') {
      const radius = snapDisplayCoordinate(Math.hypot(x - resolvedScalar(element.x), y - resolvedScalar(element.y)), element.smooth)
      return { ...cloneDisplayDesign(element), radius: literal(radius) }
    }
  }
  if (element.kind === 'text' && handle === 'anchor') return { ...cloneDisplayDesign(element), x: literal(x), y: literal(y) }
  return cloneDisplayDesign(element)
}

export function alignDisplayElements(
  document: DisplayDesignDocumentV1,
  elementIds: Iterable<string>,
  alignment: DisplayDesignAlignment,
): DisplayDesignDocumentV1 {
  const selected = new Set(elementIds)
  const overall = displaySelectionBounds(document, selected)
  if (!overall || selected.size < 2) return cloneDisplayDesign(document)
  const target = alignment === 'left' ? overall.left : alignment === 'right' ? overall.right : alignment === 'centre' ? (overall.left + overall.right) / 2
    : alignment === 'top' ? overall.top : alignment === 'bottom' ? overall.bottom : (overall.top + overall.bottom) / 2
  return {
    ...cloneDisplayDesign(document),
    elements: document.elements.map((element) => {
      if (!selected.has(element.id)) return cloneDisplayDesign(element)
      const bounds = displayElementBounds(element, document)
      const own = alignment === 'left' ? bounds.left : alignment === 'right' ? bounds.right : alignment === 'centre' ? (bounds.left + bounds.right) / 2
        : alignment === 'top' ? bounds.top : alignment === 'bottom' ? bounds.bottom : (bounds.top + bounds.bottom) / 2
      return translateDisplayElement(element, alignment === 'left' || alignment === 'centre' || alignment === 'right' ? target - own : 0, alignment === 'top' || alignment === 'middle' || alignment === 'bottom' ? target - own : 0)
    }),
  }
}

export function distributeDisplayElements(
  document: DisplayDesignDocumentV1,
  elementIds: Iterable<string>,
  direction: DisplayDesignDistribution,
): DisplayDesignDocumentV1 {
  const selected = new Set(elementIds)
  const ordered = document.elements.filter(({ id }) => selected.has(id)).map((element) => {
    const bounds = displayElementBounds(element, document)
    return { element, centre: direction === 'horizontal' ? (bounds.left + bounds.right) / 2 : (bounds.top + bounds.bottom) / 2 }
  }).sort((left, right) => left.centre - right.centre)
  if (ordered.length < 3) return cloneDisplayDesign(document)
  const interval = (ordered.at(-1)!.centre - ordered[0].centre) / (ordered.length - 1)
  const deltas = new Map(ordered.map(({ element, centre }, index) => [element.id, ordered[0].centre + interval * index - centre]))
  return {
    ...cloneDisplayDesign(document),
    elements: document.elements.map((element) => {
      const delta = deltas.get(element.id)
      return delta === undefined ? cloneDisplayDesign(element) : translateDisplayElement(element, direction === 'horizontal' ? delta : 0, direction === 'vertical' ? delta : 0)
    }),
  }
}

export function reorderDisplayDesignSelection(
  document: DisplayDesignDocumentV1,
  elementIds: Iterable<string>,
  operation: 'forward' | 'backward' | 'front' | 'back',
): DisplayDesignDocumentV1 {
  const selected = new Set(elementIds)
  if (selected.size === 0) return cloneDisplayDesign(document)
  let elements = cloneDisplayDesign(document.elements)
  if (operation === 'front' || operation === 'back') {
    const moving = elements.filter(({ id }) => selected.has(id))
    const rest = elements.filter(({ id }) => !selected.has(id))
    elements = operation === 'front' ? [...rest, ...moving] : [...moving, ...rest]
  } else if (operation === 'forward') {
    for (let index = elements.length - 2; index >= 0; index -= 1) {
      if (selected.has(elements[index].id) && !selected.has(elements[index + 1].id)) [elements[index], elements[index + 1]] = [elements[index + 1], elements[index]]
    }
  } else {
    for (let index = 1; index < elements.length; index += 1) {
      if (selected.has(elements[index].id) && !selected.has(elements[index - 1].id)) [elements[index], elements[index - 1]] = [elements[index - 1], elements[index]]
    }
  }
  return { ...cloneDisplayDesign(document), elements }
}
