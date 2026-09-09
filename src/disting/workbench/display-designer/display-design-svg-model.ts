import type { DisplayDesignElement } from './display-design-model'

export const SVG_IMPORT_LIMITS = {
  bytes: 2 * 1024 * 1024, nodes: 10_000, depth: 64, expandedNodes: 20_000,
  pathCommands: 50_000, segments: 100_000, coordinate: 1_000_000,
} as const
export interface SvgPoint { x: number; y: number }
export interface SvgBounds { x: number; y: number; width: number; height: number }
export type SvgMatrix = [number, number, number, number, number, number]
export interface SvgSegment { points: SvgPoint[] }
export interface SvgContour { start: SvgPoint; segments: SvgSegment[]; closed: boolean }
export interface SvgFinding {
  id: string; sourceId: string; message: string
  severity: 'review' | 'blocked' | 'info'
}
export interface SvgStyle {
  fill: string; stroke: string; color: string; 'stroke-width': string
  'fill-rule': string; opacity: string; 'fill-opacity': string; 'stroke-opacity': string
  'font-size': string; 'font-family': string; 'text-anchor': string
  [property: string]: string
}
export interface SvgSourceNode {
  id: string; name: string; groups: string[]; matrix: SvgMatrix; style: SvgStyle
  contours: SvgContour[]; bounds: SvgBounds
  shape?: { kind: 'rect'; x: number; y: number; width: number; height: number } | { kind: 'circle'; x: number; y: number; radius: number }
  text?: { value: string; x: number; y: number; size: number }
  findings: SvgFinding[]
}
export interface SvgScene {
  name: string; viewport: SvgBounds; nodes: SvgSourceNode[]
  groups: { id: string; name: string }[]; findings: SvgFinding[]; hiddenCount: number
}
export interface SvgNodeOverride {
  excluded?: boolean; font?: 'auto' | 'standard' | 'tiny'; text?: string
  shade?: number; x?: number; y?: number; horizontalText?: boolean; splitLines?: boolean
}
export interface SvgImportOptions {
  groupId: string; fit: 'actual' | 'artwork' | 'viewport' | 'custom'
  scale: number; x: number; y: number; margin: number; invert: boolean
  keepClipped: boolean; detail: number; accepted: string[]
  overrides: Record<string, SvgNodeOverride>; newScreen: boolean
}
export const DEFAULT_SVG_IMPORT_OPTIONS: SvgImportOptions = {
  groupId: '', fit: 'actual', scale: 1, x: 0, y: 0, margin: 0, invert: false,
  keepClipped: false, detail: 0.5, accepted: [], overrides: {}, newScreen: false,
}
export interface SvgConversion {
  elements: DisplayDesignElement[]; sourceMap: Record<string, string[]>
  findings: SvgFinding[]; bounds: SvgBounds; scale: number; offset: SvgPoint
  direct: number; approximated: number; excluded: number; sourceCount: number
}
export const SVG_IDENTITY: SvgMatrix = [1, 0, 0, 1, 0, 0]
export function svgMultiply(a: SvgMatrix, b: SvgMatrix): SvgMatrix {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]
}
export function svgPoint(m: SvgMatrix, p: SvgPoint): SvgPoint {
  const x = m[0] * p.x + m[2] * p.y + m[4], y = m[1] * p.x + m[3] * p.y + m[5]
  if (![x, y].every(v => Number.isFinite(v) && Math.abs(v) <= SVG_IMPORT_LIMITS.coordinate)) throw new Error('Transformed coordinates exceed the SVG import limit. Reduce the source dimensions.')
  return { x, y }
}
export function svgBounds(points: SvgPoint[]): SvgBounds {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 }
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity
  for (const p of points) { x = Math.min(x, p.x); y = Math.min(y, p.y); right = Math.max(right, p.x); bottom = Math.max(bottom, p.y) }
  return { x, y, width: right - x, height: bottom - y }
}
export function svgUnion(bounds: SvgBounds[]): SvgBounds {
  return svgBounds(bounds.flatMap(b => [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y + b.height }]))
}
export function svgFinding(sourceId: string, code: string, message: string, severity: SvgFinding['severity'] = 'blocked'): SvgFinding {
  return { id: `${sourceId}:${code}`, sourceId, message, severity }
}
