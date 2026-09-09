import { fontAtlas } from '../../emulation/display-font'
import { evaluateDisplayBezier } from './display-design-bezier'
import { svgCurveExtrema } from './display-design-svg-path'
import { displayPolygonVertices } from './display-design-polygon'
import { svgColour, svgLength } from './display-design-svg-style'
import { matchSvgText } from './display-design-svg-text'
import { SVG_IMPORT_LIMITS, svgBounds, svgFinding, svgPoint, svgUnion, type SvgBounds, type SvgConversion, type SvgImportOptions, type SvgPoint, type SvgScene, type SvgSourceNode } from './display-design-svg-model'
import { compileDisplayDesign, displayCommandBounds } from './display-design-compiler'
import { DISPLAY_DESIGN_LIMITS, createEmptyDisplayDesign, type DisplayDesignElement, type DisplayMode } from './display-design-model'

const literal = (value: number) => ({ kind: 'literal' as const, value })
const round = (value: number) => Math.floor(value + 0.5)
function distance(p: SvgPoint, a: SvgPoint, b: SvgPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y, den = dx * dx + dy * dy
  const t = den ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / den)) : 0
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}
function curveDetail(points: SvgPoint[], tolerance: number): { segments: number; error: number } {
  let best = { segments: 256, error: Infinity }
  // Compare each production segment with several reference samples, including rounding.
  for (let segments = 1; segments <= 256; segments = segments < 16 ? segments + 1 : segments * 2) {
    let error = 0, previous = evaluateDisplayBezier(points, 0)
    previous = { x: round(previous.x), y: round(previous.y) }
    for (let i = 1; i <= segments; i++) {
      const p = evaluateDisplayBezier(points, i / segments), next = { x: round(p.x), y: round(p.y) }
      for (let j = 0; j <= 4; j++) error = Math.max(error, distance(evaluateDisplayBezier(points, (i - 1 + j / 4) / segments), previous, next))
      previous = next
    }
    if (error < best.error) best = { segments, error }
    if (error <= tolerance) return { segments, error }
  }
  return best
}
export function svgTarget(mode: DisplayMode, margin = 0): SvgBounds {
  const y = mode === 'parameter-line' ? 10 : 0
  return { x: margin, y: y + margin, width: 256 - margin * 2, height: 64 - y - margin * 2 }
}
export function selectedSvgNodes(scene: SvgScene, options: SvgImportOptions): SvgSourceNode[] {
  return scene.nodes.filter(n => !options.groupId || n.groups.includes(options.groupId))
}
export function svgPlacement(scene: SvgScene, options: SvgImportOptions, mode: DisplayMode) {
  const nodes = selectedSvgNodes(scene, options).filter(n => !options.overrides[n.id]?.excluded)
  const target = svgTarget(mode, options.margin)
  const artwork = svgUnion(nodes.map(n => n.bounds))
  const bounds = options.fit === 'viewport' ? scene.viewport : artwork
  let scale = options.fit === 'custom' ? options.scale : 1, x = options.fit === 'custom' ? options.x : 0, y = options.fit === 'custom' ? options.y : 0
  if (options.fit === 'artwork' || options.fit === 'viewport') {
    const hasStroke = nodes.some(node => node.style.stroke !== 'none' && Number(node.style['stroke-width']) !== 0)
    const fitWidth = target.width - (hasStroke ? 1 : 0), fitHeight = target.height - (hasStroke ? 1 : 0)
    scale = Math.min(bounds.width ? fitWidth / bounds.width : Infinity, bounds.height ? fitHeight / bounds.height : Infinity)
    if (!Number.isFinite(scale)) scale = 1
    x = target.x + (fitWidth - bounds.width * scale) / 2 - bounds.x * scale
    y = target.y + (fitHeight - bounds.height * scale) / 2 - bounds.y * scale
  }
  return { scale, x, y, target, artwork, nodes }
}

/** Pure, bounded conversion. Yielding between objects keeps the browser responsive. */
export function* convertSvg(scene: SvgScene, options: SvgImportOptions, mode: DisplayMode): Generator<void, SvgConversion> {
  const { scale, x, y, target, nodes } = svgPlacement(scene, options, mode)
  const result: SvgConversion = { elements: [], sourceMap: {}, findings: [...scene.findings], bounds: { x: 0, y: 0, width: 0, height: 0 }, scale, offset: { x, y }, direct: 0, approximated: 0, excluded: 0, sourceCount: nodes.length }
  if (![scale, x, y, options.margin, options.detail].every(Number.isFinite) || scale <= 0 || target.width <= 0 || target.height <= 0 || options.margin < 0 || options.detail < 0.25 || options.detail > 4) {
    result.findings.push(svgFinding('document', 'placement', 'Use finite placement values, a positive scale, margin 0–26, and detail tolerance 0.25–4 pixels.')); return result
  }
  let intermediateSegments = 0
  const allBounds: SvgBounds[] = []
  const textBounds: { sourceId: string; bounds: SvgBounds }[] = []
  for (const node of nodes) {
    yield
    const override = options.overrides[node.id] ?? {}
    if (override.excluded) { result.excluded++; continue }
    const start = result.elements.length
    result.findings.push(...node.findings)
    let approximate = false
    const issue = (code: string, message: string, severity: 'review' | 'blocked' | 'info' = 'review') => {
      result.findings.push(svgFinding(node.id, code, message, severity)); if (severity !== 'info') approximate = true
    }
    const transform = (p: SvgPoint) => {
      const point = svgPoint(node.matrix, p)
      return { x: point.x * scale + x + (override.x ?? 0), y: point.y * scale + y + (override.y ?? 0) }
    }
    const add = (element: DisplayDesignElement) => {
      if (result.elements.length >= DISPLAY_DESIGN_LIMITS.maximumPrimitives + 1) throw new Error('Conversion exceeds 512 primitives. Select fewer groups or reduce curve detail.')
      result.elements.push(element)
    }
    let index = 0
    const base = (shade: number) => ({ id: `${node.id}-element-${index++}`, name: node.name, shade: literal(shade), visible: { kind: 'visible' as const } })
    try {
      const paint = (key: 'fill' | 'stroke') => {
        const color = svgColour(node.style[key], node.style.color)
        if (!color) return null
        const opacity = Number(node.style[`${key}-opacity`])
        if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error(`Invalid ${key} opacity.`)
        if (color.alpha * opacity === 0) return null
        if (color.alpha * opacity !== 1) issue(`${key}-opacity`, `Partial ${key} opacity is unsupported. Make the source paint opaque or exclude this object.`, 'blocked')
        const shade = override.shade ?? (options.invert ? 15 - color.shade : color.shade)
        if (shade === 0) issue(`${key}-black`, 'Shade 0 paints black; it is not transparency. Review visibility against the display background.', 'info')
        if (!Number.isInteger(shade) || shade < 0 || shade > 15) throw new Error('Shade must be a whole number from 0 through 15.')
        return shade
      }
      const fill = paint('fill'), stroke = paint('stroke')
      if (node.text) {
        const value = override.text ?? node.text.value
        if ([...value].length > DISPLAY_DESIGN_LIMITS.maximumTextCodePoints) throw new Error('Text exceeds 512 characters. Shorten it or split the source labels.')
        const origin = transform({ x: node.text.x, y: node.text.y })
        const values = override.splitLines ? value.split(/\r?\n/u) : [value]
        let baseline = round(origin.y)
        for (const line of values) {
          const matched = matchSvgText(node, scale, round(origin.x), baseline, target, { ...override, text: line })
          result.findings.push(...matched.findings)
          if (stroke !== null) issue('text-stroke', fill === null ? 'Stroke-only text becomes solid native glyphs. Accept the replacement or edit the source.' : 'Native text has no stroke. Accept fill-only text or edit the source.')
          const textShade = fill ?? stroke
          if (textShade !== null) {
            add({ ...base(textShade), kind: 'text', tiny: matched.chosen.tiny, x: literal(round(origin.x)), y: literal(baseline), align: matched.align, text: { kind: 'literal', value: matched.value } })
            allBounds.push(matched.chosen.bounds)
            textBounds.push({ sourceId: node.id, bounds: matched.chosen.bounds })
            approximate = true
          }
          baseline += fontAtlas(matched.chosen.tiny).lineHeight
        }
      } else {
        const contours = node.contours.map(c => ({ ...c, start: transform(c.start), segments: c.segments.map(s => ({ points: s.points.map(transform) })) }))
        const bounds = svgBounds(contours.flatMap(c => [c.start, ...c.segments.flatMap(s => svgCurveExtrema(s.points))]))
        const m = node.matrix, axisAligned = Math.abs(m[1]) + Math.abs(m[2]) < 1e-7 || Math.abs(m[0]) + Math.abs(m[3]) < 1e-7
        const sx = Math.hypot(m[0], m[1]), sy = Math.hypot(m[2], m[3])
        const uniform = Math.abs(sx - sy) < 1e-7 && Math.abs(m[0] * m[2] + m[1] * m[3]) < 1e-7
        const strokeWidth = svgLength(node.style['stroke-width'], Math.hypot(scene.viewport.width, scene.viewport.height) / Math.SQRT2, 1) * Math.max(sx, sy) * scale
        if (strokeWidth < 0) throw new Error('Stroke width must not be negative.')
        if (stroke !== null && fill !== null && stroke === fill && node.style.stroke !== node.style.fill) issue('paint-contrast', 'Fill and stroke become the same shade. Review contrast or choose different source shades.')
        if (stroke !== null && strokeWidth !== 0 && (Math.abs(strokeWidth - 1) > 0.05 || !uniform)) issue('stroke-width', `Stroke becomes ${strokeWidth.toFixed(2)} pixels or has nonuniform scaling. Proposed outline uses one pixel; accept it or expand the source stroke.`)
        for (const property of ['stroke-dasharray', 'stroke-dashoffset', 'vector-effect', 'stroke-linecap', 'stroke-linejoin']) {
          const allowed: Record<string, string[]> = { 'stroke-dasharray': ['none'], 'stroke-dashoffset': ['0', '0px'], 'vector-effect': ['none'], 'stroke-linecap': ['butt'], 'stroke-linejoin': ['miter'] }
          if (stroke !== null && node.style[property] && !allowed[property]!.includes(node.style[property]!)) issue(property, `${property} cannot be preserved by the proposed thin outline. Accept a plain outline or expand the stroke in the source.`)
        }
        let flattened: SvgPoint[][] | undefined
        const flatten = () => {
          if (flattened) return flattened
          flattened = contours.map(c => {
            const points = [c.start]
            for (const segment of c.segments) {
              const detail = segment.points.length === 2 ? 1 : Math.min(256, Math.max(8, Math.ceil(Math.hypot(bounds.width, bounds.height) / 2)))
              intermediateSegments += detail
              if (intermediateSegments > SVG_IMPORT_LIMITS.segments) throw new Error('Intermediate geometry limit exceeded. Select fewer source objects.')
              for (let i = 1; i <= detail; i++)points.push(evaluateDisplayBezier(segment.points, i / detail))
            }
            return points
          })
          return flattened
        }
        const emitFill = () => {
          if (fill === null) return
          if (node.shape?.kind === 'rect' && axisAligned) {
            const a = transform({ x: node.shape.x, y: node.shape.y }), b = transform({ x: node.shape.x + node.shape.width, y: node.shape.y + node.shape.height })
            const left = round(Math.min(a.x, b.x)), top = round(Math.min(a.y, b.y)), right = round(Math.max(a.x, b.x)) - 1, bottom = round(Math.max(a.y, b.y)) - 1
            if (right < left || bottom < top) { issue('disappeared', 'This fill disappears at the chosen scale. Increase scale or explicitly exclude it.'); return }
            add({ ...base(fill), kind: 'box', fill: true, x1: literal(left), y1: literal(top), x2: literal(right), y2: literal(bottom) })
            allBounds.push({ x: left, y: top, width: right - left + 1, height: bottom - top + 1 }); return
          }
          const paths = flatten().filter(p => p.length > 2)
          if (!paths.length) return
          const regions: { x1: number; x2: number; y1: number; y2: number }[] = [], active = new Map<string, { x1: number; x2: number; y1: number; y2: number }>()
          if (!['evenodd', 'nonzero'].includes(node.style['fill-rule'])) throw new Error('Unsupported fill rule.')
          // Scan at pixel centres. Unpainted spans/holes emit nothing, including over black artwork.
          for (let row = Math.max(0, Math.floor(bounds.y)); row < Math.min(64, Math.ceil(bounds.y + bounds.height)); row++) {
            const crossings: { x: number; winding: number }[] = [], scanY = row + 0.5
            for (const path of paths) for (let i = 0; i < path.length; i++) {
              const a = path[i]!, b = path[(i + 1) % path.length]!
              if ((a.y <= scanY && b.y > scanY) || (b.y <= scanY && a.y > scanY)) crossings.push({ x: a.x + (scanY - a.y) * (b.x - a.x) / (b.y - a.y), winding: b.y > a.y ? 1 : -1 })
            }
            crossings.sort((a, b) => a.x - b.x)
            let winding = 0, inside = false, left = 0
            const next = new Map<string, { x1: number; x2: number; y1: number; y2: number }>()
            for (const crossing of crossings) {
              const wasInside = inside; winding += crossing.winding
              inside = node.style['fill-rule'] === 'evenodd' ? !inside : winding !== 0
              if (!wasInside && inside) left = crossing.x
              else if (wasInside && !inside) {
                const x1 = Math.max(0, Math.ceil(left - 0.5)), x2 = Math.min(255, Math.ceil(crossing.x - 0.5) - 1)
                if (x2 >= x1) { const key = `${x1}:${x2}`, old = active.get(key); next.set(key, old ? { ...old, y2: row } : { x1, x2, y1: row, y2: row }) }
              }
            }
            for (const [key, region] of active) if (!next.has(key)) regions.push(region)
            active.clear(); for (const [key, region] of next) active.set(key, region)
          }
          regions.push(...active.values())
          for (const r of regions) add({ ...base(fill), kind: 'box', fill: true, x1: literal(r.x1), y1: literal(r.y1), x2: literal(r.x2), y2: literal(r.y2) })
          if (paths.some(p => p.length > 2)) { approximate = true; issue('fill-raster', 'Filled geometry is converted to editable pixel rectangles; holes remain unpainted.', 'info') }
          allBounds.push(bounds)
          if (!regions.length) issue('disappeared', 'No filled pixels remain on the display. Reposition or explicitly exclude this object.')
        }
        const emitStroke = () => {
          if (stroke === null || strokeWidth === 0) return
          if (node.shape?.kind === 'rect' && axisAligned) {
            add({ ...base(stroke), kind: 'box', fill: false, x1: literal(round(bounds.x)), y1: literal(round(bounds.y)), x2: literal(round(bounds.x + bounds.width)), y2: literal(round(bounds.y + bounds.height)) })
          } else if (node.shape?.kind === 'circle' && uniform) {
            const p = transform({ x: node.shape.x, y: node.shape.y }), radius = node.shape.radius * sx * scale
            const smooth = [p.x, p.y, radius].some(n => Math.abs(n - round(n)) > 0.05)
            add({ ...base(stroke), kind: 'circle', smooth, x: literal(smooth ? p.x : round(p.x)), y: literal(smooth ? p.y : round(p.y)), radius: literal(smooth ? radius : round(radius)) })
            if (smooth) issue('smooth', 'Smooth circle rendering is an approximate browser preview.', 'info')
          } else {
            let regular = false
            if (contours.length === 1 && contours[0]!.closed && contours[0]!.segments.every(s => s.points.length === 2)) {
              const vertices = contours[0]!.segments.map(s => s.points[0]!), count = vertices.length
              if (count >= 3 && count <= 256) {
                const cx = round(vertices.reduce((s, p) => s + p.x, 0) / count), cy = round(vertices.reduce((s, p) => s + p.y, 0) / count), r = round(Math.hypot(vertices[0]!.x - cx, vertices[0]!.y - cy))
                const expected = displayPolygonVertices(cx, cy, r, count)
                if (expected.some((_, offset) => [1, -1].some(direction => vertices.every((p, i) => { const q = expected[(offset + direction * i + count) % count]!; return Math.hypot(p.x - q.x, p.y - q.y) < 0.05 })))) { add({ ...base(stroke), kind: 'polygon', x: literal(cx), y: literal(cy), radius: literal(r), sides: count }); regular = true }
              }
            }
            if (!regular) for (const c of contours) for (const segment of c.segments) {
              if (segment.points.length === 2) {
                const [a, b] = segment.points as [SvgPoint, SvgPoint], smooth = [a.x, a.y, b.x, b.y].some(n => Math.abs(n - round(n)) > 0.05)
                add({ ...base(stroke), kind: 'line', smooth, x1: literal(smooth ? a.x : round(a.x)), y1: literal(smooth ? a.y : round(a.y)), x2: literal(smooth ? b.x : round(b.x)), y2: literal(smooth ? b.y : round(b.y)) })
                if (smooth) approximate = true
              } else {
                const detail = curveDetail(segment.points, options.detail)
                intermediateSegments += detail.segments
                if (intermediateSegments > SVG_IMPORT_LIMITS.segments) throw new Error('Intermediate geometry limit exceeded.')
                add({ ...base(stroke), kind: 'bezier', points: segment.points.map(p => ({ x: literal(p.x), y: literal(p.y) })), segments: detail.segments })
                approximate = true
                if (detail.error > options.detail) issue('curve-error', `Curve deviation is ${detail.error.toFixed(2)} px at ${detail.segments} segments. Accept this approximation or simplify the source.`)
              }
            }
          }

        }
        const order = node.style['paint-order'] ?? 'normal'
        if (!/^(normal|fill(?: stroke)?|stroke(?: fill)?)$/u.test(order)) issue('paint-order', 'Unsupported paint order. Review the proposed fill and stroke ordering.', 'blocked')
        if (order.startsWith('stroke')) { emitStroke(); emitFill() } else { emitFill(); emitStroke() }
      }
    } catch (error) { issue('conversion', error instanceof Error ? error.message : 'Could not convert this object.', 'blocked') }
    result.sourceMap[node.id] = result.elements.slice(start).map(e => e.id)
    if (result.elements.length > start) { if (approximate) result.approximated++; else result.direct++ }
  }
  for (let i = 0; i < textBounds.length; i++) for (let j = i + 1; j < textBounds.length; j++) {
    const first = textBounds[i]!, second = textBounds[j]!, a = first.bounds, b = second.bounds
    if (a.width > 0 && b.width > 0 && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) {
      result.findings.push(svgFinding(first.sourceId, `text-overlap-${second.sourceId}`, 'Native text overlaps another label. Reposition/edit it or accept the overlap.', 'review'))
    }
  }
  const compiled = compileDisplayDesign({ ...createEmptyDisplayDesign(), displayMode: mode, elements: result.elements })
  for (const command of compiled.commands) { const b = displayCommandBounds(command); if (b) allBounds.push({ x: b.left, y: b.top, width: b.right - b.left + 1, height: b.bottom - b.top + 1 }) }
  result.bounds = svgUnion(allBounds)
  const b = result.bounds
  const overflow = { left: Math.max(0, target.x - b.x), top: Math.max(0, target.y - b.y), right: Math.max(0, b.x + b.width - target.x - target.width), bottom: Math.max(0, b.y + b.height - target.y - target.height) }
  if (Object.values(overflow).some(n => n > 0.01)) result.findings.push(svgFinding('document', 'clipping', `Artwork exceeds the drawing area: left ${overflow.left.toFixed(1)}, top ${overflow.top.toFixed(1)}, right ${overflow.right.toFixed(1)}, bottom ${overflow.bottom.toFixed(1)} px. Fit/reposition it or choose Keep clipped.`, options.keepClipped ? 'info' : 'blocked'))
  if (!result.elements.length) result.findings.push(svgFinding('document', 'empty', 'No drawable elements remain. Choose other artwork or resolve the source findings.'))
  // Deduplicate findings from repeated segments while retaining source identity.
  result.findings = [...new Map(result.findings.map(f => [f.id, f])).values()]
  return result
}
export function convertDisplaySvg(scene: SvgScene, options: SvgImportOptions, mode: DisplayMode): SvgConversion {
  const iterator = convertSvg(scene, options, mode); let step = iterator.next(); while (!step.done) step = iterator.next(); return step.value
}
export async function convertDisplaySvgAsync(scene: SvgScene, options: SvgImportOptions, mode: DisplayMode, signal: AbortSignal): Promise<SvgConversion> {
  signal.throwIfAborted(); const iterator = convertSvg(scene, options, mode); let step = iterator.next(), count = 0
  while (!step.done) { if (++count % 8 === 0) { await new Promise<void>(r => setTimeout(r, 0)); signal.throwIfAborted() } step = iterator.next() }
  signal.throwIfAborted(); return step.value
}
