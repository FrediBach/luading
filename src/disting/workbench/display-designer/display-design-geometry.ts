import { fontAtlas, measureDistingText } from '../../emulation/display-font'
import { DISTING_DISPLAY } from '../../types'
import {
  activeDisplayDesignElements,
  activeDisplayDesignScreen,
  cloneDisplayDesign,
  createDefaultDisplayPrimitive,
  type DisplayDesignDocument,
  type DisplayDesignElement,
  type DisplayDesignIdFactory,
  type DisplayMode,
  type DisplayPrimitiveElement,
  type DisplayPrimitivePreset,
  type DisplayScalar,
} from './display-design-model'
import { createDisplayBindingMap, createDisplayTokenMap, offsetDisplayScalar, resolveDisplayScalar, resolveDisplayText, resolveDisplayVisibility, setDisplayScalarPreviewValue } from './display-design-resolution'
import { displayPolygonVertices } from './display-design-polygon'
import { compileDisplayBezierLines } from './display-design-bezier'

export interface DisplayDesignPoint { x: number; y: number }
export interface DisplayDesignBounds { left: number; top: number; right: number; bottom: number }
export interface DisplayDesignClientRect { left: number; top: number; width: number; height: number }
export type DisplayDesignHandle = 'start' | 'end' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'centre' | 'radius' | 'anchor' | `point-${number}`
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
  if (element.kind === 'pixel-box') {
    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const width = Math.abs(end.x - start.x) + 1
    const height = Math.abs(end.y - start.y) + 1
    return { ...element, x: literal(x), y: literal(y), width, height, shades: Array(width * height).fill(15) }
  }
  if (element.kind === 'line' || element.kind === 'box') {
    return { ...element, x1: literal(start.x), y1: literal(start.y), x2: literal(end.x), y2: literal(end.y) }
  }
  if (element.kind === 'bezier') {
    const dx = end.x - start.x
    return {
      ...element,
      points: [
        { x: literal(Math.round(start.x)), y: literal(Math.round(start.y)) },
        { x: literal(Math.round(start.x + dx / 3)), y: literal(Math.round(start.y)) },
        { x: literal(Math.round(start.x + 2 * dx / 3)), y: literal(Math.round(end.y)) },
        { x: literal(Math.round(end.x)), y: literal(Math.round(end.y)) },
      ],
    }
  }
  if (element.kind === 'circle' || element.kind === 'polygon') {
    const radius = snapDisplayCoordinate(Math.hypot(end.x - start.x, end.y - start.y), element.kind === 'circle' && element.smooth)
    return { ...element, x: literal(start.x), y: literal(start.y), radius: literal(radius) }
  }
  return { ...element, x: literal(start.x), y: literal(start.y) }
}

function resolvedScalar(value: DisplayScalar, document?: DisplayDesignDocument): number {
  if (value.kind === 'literal') return value.value
  return resolveDisplayScalar(
    value,
    createDisplayBindingMap(document?.bindings ?? []),
    createDisplayTokenMap(document?.tokens ?? []),
  )
}

export function displayElementBounds(
  element: DisplayDesignElement,
  document?: DisplayDesignDocument,
): DisplayDesignBounds {
  const scalar = (value: DisplayScalar) => resolvedScalar(value, document)
  if (element.kind === 'symbol-instance') {
    const x = scalar(element.x)
    const y = scalar(element.y)
    const bindings = createDisplayBindingMap(document?.bindings ?? [])
    const symbol = document?.symbols.find(({ id }) => id === element.symbolId)
    let variantId = symbol?.defaultVariantId
    if (element.state.kind === 'literal') variantId = element.state.variantId
    else {
      const binding = bindings.get(element.state.bindingId)
      if (binding?.kind === 'choice') variantId = element.state.variantByChoiceId[binding.previewChoiceId] ?? variantId
    }
    const variant = symbol?.variants.find(({ id }) => id === variantId)
      ?? symbol?.variants.find(({ id }) => id === symbol.defaultVariantId)
    const primitiveBounds = variant?.elements
      .filter((primitive) => resolveDisplayVisibility(primitive.visible, bindings))
      .map((primitive) => displayElementBounds(primitive, document)) ?? []
    if (primitiveBounds.length > 0) return {
      left: x + Math.min(...primitiveBounds.map(({ left }) => left)),
      top: y + Math.min(...primitiveBounds.map(({ top }) => top)),
      right: x + Math.max(...primitiveBounds.map(({ right }) => right)),
      bottom: y + Math.max(...primitiveBounds.map(({ bottom }) => bottom)),
    }
    return { left: x, top: y, right: x, bottom: y }
  }
  if (element.kind === 'pixel-box') return {
    left: scalar(element.x),
    top: scalar(element.y),
    right: scalar(element.x) + element.width - 1,
    bottom: scalar(element.y) + element.height - 1,
  }
  if (element.kind === 'line' || element.kind === 'box') {
    const x1 = scalar(element.x1); const y1 = scalar(element.y1)
    const x2 = scalar(element.x2); const y2 = scalar(element.y2)
    return { left: Math.min(x1, x2), top: Math.min(y1, y2), right: Math.max(x1, x2), bottom: Math.max(y1, y2) }
  }
  if (element.kind === 'bezier') {
    const xs = element.points.map((point) => scalar(point.x))
    const ys = element.points.map((point) => scalar(point.y))
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
  }
  if (element.kind === 'circle' || element.kind === 'polygon') {
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
  document: DisplayDesignDocument,
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

export function displayAreaBounds(start: DisplayDesignPoint, end: DisplayDesignPoint): DisplayDesignBounds {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  }
}

export function displayElementsWithinArea(
  document: DisplayDesignDocument,
  start: DisplayDesignPoint,
  end: DisplayDesignPoint,
): string[] {
  const area = displayAreaBounds(start, end)
  return document.elements
    .filter((element) => {
      const bounds = displayElementBounds(element, document)
      return bounds.left >= area.left
        && bounds.top >= area.top
        && bounds.right <= area.right
        && bounds.bottom <= area.bottom
    })
    .map(({ id }) => id)
}

export function displayElementHandles(element: DisplayDesignElement, document?: DisplayDesignDocument): Array<{ id: DisplayDesignHandle; point: DisplayDesignPoint }> {
  const scalar = (value: DisplayScalar) => resolvedScalar(value, document)
  if (element.kind === 'line') return [
    { id: 'start', point: { x: scalar(element.x1), y: scalar(element.y1) } },
    { id: 'end', point: { x: scalar(element.x2), y: scalar(element.y2) } },
  ]
  if (element.kind === 'bezier') return element.points.map((point, index) => ({
    id: `point-${index}` as const,
    point: { x: scalar(point.x), y: scalar(point.y) },
  }))
  if (element.kind === 'box' || element.kind === 'pixel-box') {
    const bounds = displayElementBounds(element, document)
    return [
      { id: 'top-left', point: { x: bounds.left, y: bounds.top } },
      { id: 'top-right', point: { x: bounds.right, y: bounds.top } },
      { id: 'bottom-left', point: { x: bounds.left, y: bounds.bottom } },
      { id: 'bottom-right', point: { x: bounds.right, y: bounds.bottom } },
    ]
  }
  if (element.kind === 'circle' || element.kind === 'polygon') {
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
  document?: DisplayDesignDocument,
): boolean {
  if (element.kind === 'line') {
    const [start, end] = displayElementHandles(element, document)
    return distanceToSegment(point, start.point, end.point) <= tolerance
  }
  if (element.kind === 'bezier') {
    const commands = compileDisplayBezierLines(element.points.map((control) => ({
      x: resolvedScalar(control.x, document),
      y: resolvedScalar(control.y, document),
    })), element.segments, 15)
    return commands.some((command) => command.kind === 'line' && distanceToSegment(point, { x: command.x1, y: command.y1 }, { x: command.x2, y: command.y2 }) <= tolerance)
  }
  if (element.kind === 'polygon') {
    const x = resolvedScalar(element.x, document)
    const y = resolvedScalar(element.y, document)
    const vertices = displayPolygonVertices(x, y, resolvedScalar(element.radius, document), element.sides)
    return vertices.some((start, index) => distanceToSegment(point, start, vertices[(index + 1) % vertices.length]!) <= tolerance)
      || Math.hypot(point.x - x, point.y - y) <= tolerance
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
  document: DisplayDesignDocument,
  point: DisplayDesignPoint,
  tolerance: number,
): string | undefined {
  return [...document.elements].reverse().find((element) => displayElementHitTest(element, point, tolerance, document))?.id
}

function translateScalar(value: DisplayScalar, delta: number): DisplayScalar {
  return offsetDisplayScalar(value, delta)
}

export function translateDisplayElement(element: DisplayDesignElement, dx: number, dy: number): DisplayDesignElement {
  if (element.kind === 'pixel-box') return {
    ...cloneDisplayDesign(element),
    x: translateScalar(element.x, Math.round(dx)),
    y: translateScalar(element.y, Math.round(dy)),
  }
  if (element.kind === 'line' || element.kind === 'box') return {
    ...cloneDisplayDesign(element),
    x1: translateScalar(element.x1, dx), y1: translateScalar(element.y1, dy),
    x2: translateScalar(element.x2, dx), y2: translateScalar(element.y2, dy),
  }
  if (element.kind === 'bezier') return {
    ...cloneDisplayDesign(element),
    points: element.points.map((point) => ({ x: translateScalar(point.x, dx), y: translateScalar(point.y, dy) })),
  }
  return { ...cloneDisplayDesign(element), x: translateScalar(element.x, dx), y: translateScalar(element.y, dy) }
}

export function translateDisplayElements(
  document: DisplayDesignDocument,
  elementIds: Iterable<string>,
  dx: number,
  dy: number,
): DisplayDesignDocument {
  const selected = new Set(elementIds)
  return { ...cloneDisplayDesign(document), elements: document.elements.map((element) => selected.has(element.id) ? translateDisplayElement(element, dx, dy) : cloneDisplayDesign(element)) }
}

export function constrainDisplayPointerTranslation(
  document: DisplayDesignDocument,
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
  document?: DisplayDesignDocument,
): DisplayDesignElement {
  if (element.kind === 'symbol-instance') return cloneDisplayDesign(element)
  const smooth = (element.kind === 'line' || element.kind === 'circle') && element.smooth
  const x = snapDisplayCoordinate(point.x, smooth); const y = snapDisplayCoordinate(point.y, smooth)
  const bindings = createDisplayBindingMap(document?.bindings ?? [])
  const tokens = createDisplayTokenMap(document?.tokens ?? [])
  const set = (scalar: DisplayScalar, value: number) => setDisplayScalarPreviewValue(scalar, value, bindings, tokens)
  if (element.kind === 'pixel-box') {
    const bounds = displayElementBounds(element)
    const left = handle.endsWith('left') ? x : bounds.left
    const right = handle.endsWith('right') ? x : bounds.right
    const top = handle.startsWith('top') ? y : bounds.top
    const bottom = handle.startsWith('bottom') ? y : bounds.bottom
    const nextLeft = Math.min(left, right)
    const nextRight = Math.max(left, right)
    const nextTop = Math.min(top, bottom)
    const nextBottom = Math.max(top, bottom)
    const width = nextRight - nextLeft + 1
    const height = nextBottom - nextTop + 1
    const shades = Array<number>(width * height).fill(0)
    for (let targetY = nextTop; targetY <= nextBottom; targetY += 1) {
      for (let targetX = nextLeft; targetX <= nextRight; targetX += 1) {
        if (targetX < bounds.left || targetX > bounds.right || targetY < bounds.top || targetY > bounds.bottom) continue
        shades[(targetY - nextTop) * width + targetX - nextLeft] = element.shades[(targetY - bounds.top) * element.width + targetX - bounds.left] ?? 0
      }
    }
    return { ...cloneDisplayDesign(element), x: set(element.x, nextLeft), y: set(element.y, nextTop), width, height, shades }
  }
  if (element.kind === 'line') {
    if (handle === 'start') return { ...cloneDisplayDesign(element), x1: set(element.x1, x), y1: set(element.y1, y) }
    if (handle === 'end') return { ...cloneDisplayDesign(element), x2: set(element.x2, x), y2: set(element.y2, y) }
  }
  if (element.kind === 'bezier' && handle.startsWith('point-')) {
    const index = Number(handle.slice('point-'.length))
    if (Number.isInteger(index) && element.points[index]) {
      const points = cloneDisplayDesign(element.points)
      points[index] = { x: set(points[index]!.x, x), y: set(points[index]!.y, y) }
      return { ...cloneDisplayDesign(element), points }
    }
  }
  if (element.kind === 'box') {
    const x1 = resolveDisplayScalar(element.x1, bindings, tokens)
    const x2 = resolveDisplayScalar(element.x2, bindings, tokens)
    const y1 = resolveDisplayScalar(element.y1, bindings, tokens)
    const y2 = resolveDisplayScalar(element.y2, bindings, tokens)
    const leftProperty = x1 <= x2 ? 'x1' : 'x2'; const rightProperty = x1 <= x2 ? 'x2' : 'x1'
    const topProperty = y1 <= y2 ? 'y1' : 'y2'; const bottomProperty = y1 <= y2 ? 'y2' : 'y1'
    const next = cloneDisplayDesign(element)
    const xProperty = handle.endsWith('left') ? leftProperty : rightProperty
    const yProperty = handle.startsWith('top') ? topProperty : bottomProperty
    next[xProperty] = set(next[xProperty], x)
    next[yProperty] = set(next[yProperty], y)
    return next
  }
  if (element.kind === 'circle' || element.kind === 'polygon') {
    if (handle === 'centre') return { ...cloneDisplayDesign(element), x: set(element.x, x), y: set(element.y, y) }
    if (handle === 'radius') {
      const radius = snapDisplayCoordinate(Math.hypot(x - resolvedScalar(element.x, document), y - resolvedScalar(element.y, document)), element.kind === 'circle' && element.smooth)
      return { ...cloneDisplayDesign(element), radius: set(element.radius, radius) }
    }
  }
  if (element.kind === 'text' && handle === 'anchor') return { ...cloneDisplayDesign(element), x: set(element.x, x), y: set(element.y, y) }
  return cloneDisplayDesign(element)
}

export function alignDisplayElements(
  document: DisplayDesignDocument,
  elementIds: Iterable<string>,
  alignment: DisplayDesignAlignment,
): DisplayDesignDocument {
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
  document: DisplayDesignDocument,
  elementIds: Iterable<string>,
  direction: DisplayDesignDistribution,
): DisplayDesignDocument {
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
  document: DisplayDesignDocument,
  elementIds: Iterable<string>,
  operation: 'forward' | 'backward' | 'front' | 'back',
): DisplayDesignDocument {
  const selected = new Set(elementIds)
  if (selected.size === 0) return cloneDisplayDesign(document)
  let elements = cloneDisplayDesign(activeDisplayDesignElements(document))
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
  const screenId = activeDisplayDesignScreen(document).id
  let activeIndex = 0
  return {
    ...cloneDisplayDesign(document),
    elements: document.elements.map((element) => !element.screenId || element.screenId === screenId
      ? cloneDisplayDesign(elements[activeIndex++]!)
      : cloneDisplayDesign(element)),
  }
}
