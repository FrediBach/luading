import { SVG_DEFAULT_STYLE, resolveSvgStyle, svgCss, svgLength } from './display-design-svg-style'
import { parseSvgPath, svgNumbers, svgTransform, svgCurveExtrema } from './display-design-svg-path'
import { SVG_IDENTITY, SVG_IMPORT_LIMITS, svgBounds, svgFinding, svgMultiply, svgPoint, type SvgBounds, type SvgContour, type SvgFinding, type SvgMatrix, type SvgScene, type SvgSourceNode, type SvgStyle } from './display-design-svg-model'

const NS = 'http://www.w3.org/2000/svg'
function viewportMatrix(box: SvgBounds, width: number, height: number, aspect: string): SvgMatrix {
  const parts = aspect.trim().split(/\s+/u), alignment = parts[0] || 'xMidYMid', mode = parts[1] || 'meet'
  if (!/^(none|x(Min|Mid|Max)Y(Min|Mid|Max))$/u.test(alignment) || !['meet', 'slice'].includes(mode)) throw new Error('Unsupported preserveAspectRatio value.')
  let sx = width / box.width, sy = height / box.height
  if (alignment !== 'none') sx = sy = mode === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy)
  const tx = alignment.includes('xMax') ? width - box.width * sx : alignment.includes('xMid') ? (width - box.width * sx) / 2 : 0
  const ty = alignment.includes('YMax') ? height - box.height * sy : alignment.includes('YMid') ? (height - box.height * sy) / 2 : 0
  return [sx, 0, 0, sy, tx - box.x * sx, ty - box.y * sy]
}
function viewBox(element: Element): SvgBounds | undefined {
  if (!element.hasAttribute('viewBox')) return undefined
  const n = svgNumbers(element.getAttribute('viewBox')!)
  if (n.length !== 4 || n[2]! <= 0 || n[3]! <= 0) throw new Error('SVG viewBox needs a positive width and height.')
  return { x: n[0]!, y: n[1]!, width: n[2]!, height: n[3]! }
}
function lines(points: { x: number; y: number }[], closed: boolean): SvgContour[] {
  if (!points.length) return []
  const chain = closed ? [...points, points[0]!] : points
  return [{ start: points[0]!, closed, segments: chain.slice(1).map((p, i) => ({ points: [chain[i]!, p] })) }]
}

/** Detached XML only. The returned scene contains no DOM nodes or executable markup. */
export function* normalizeSvg(root: Element, name: string, dimensions?: { width: number; height: number }): Generator<void, SvgScene> {
  const all = [root, ...root.querySelectorAll('*')]
  if (all.length > SVG_IMPORT_LIMITS.nodes) throw new Error('SVG has too many elements. Export only the desired artboard or group.')
  const ids = new Map<string, Element>()
  for (const element of all) {
    if (element.id) { if (ids.has(element.id)) throw new Error(`Duplicate SVG ID “${element.id}”. Make source IDs unique.`); ids.set(element.id, element) }
  }
  const sheets = all.filter(e => e.localName === 'style').map(e => svgCss(e.textContent ?? ''))
  const rules = sheets.flatMap(s => s.rules)
  const vb = viewBox(root)
  const width = dimensions?.width ?? svgLength(root.getAttribute('width') ?? '', vb?.width ?? 0, vb?.width ?? 0)
  const height = dimensions?.height ?? svgLength(root.getAttribute('height') ?? '', vb?.height ?? 0, vb?.height ?? 0)
  if (![width, height].every(n => Number.isFinite(n) && n > 0 && n <= SVG_IMPORT_LIMITS.coordinate)) throw new Error('Supply a positive source viewport width and height, or export an SVG with a viewBox.')
  const scene: SvgScene = { name, viewport: { x: 0, y: 0, width, height }, nodes: [], groups: [], findings: [], hiddenCount: 0 }
  if (sheets.some(s => s.unsupported)) scene.findings.push(svgFinding('document', 'css', 'Some stylesheet selectors or at-rules are unsupported. Export using simple class/ID rules or inline styles.'))
  let expanded = 0
  const budget = { commands: 0 }
  function* walk(element: Element, parent: SvgStyle, parentMatrix: SvgMatrix, groups: string[], inherited: SvgFinding[], depth: number, viewport: SvgBounds, chain: Set<Element>, referenced = false, useSize?: { width: number; height: number }): Generator<void> {
    if (depth > SVG_IMPORT_LIMITS.depth || ++expanded > SVG_IMPORT_LIMITS.expandedNodes) throw new Error('SVG nesting or reference expansion limit exceeded.')
    if (expanded % 32 === 0) yield
    const id = `svg-${expanded}`, tag = element.localName
    const label = (element.getAttribute('aria-label') || element.getAttribute('data-name') || element.getAttribute('inkscape:label') || element.id || `${tag} ${expanded}`).slice(0, 80)
    const findings = inherited.map(f => ({ ...f, id: `${id}:${f.id}`, sourceId: id }))
    const issue = (code: string, message: string, severity: SvgFinding['severity'] = 'blocked') => findings.push(svgFinding(id, code, message, severity))
    if (element.namespaceURI !== NS && element.namespaceURI !== null) { issue('namespace', 'Unsupported embedded content. Remove it or exclude this object.'); scene.nodes.push({ id, name: label, groups, matrix: parentMatrix, style: parent, contours: [], bounds: { x: 0, y: 0, width: 0, height: 0 }, findings }); return }
    if (['style', 'title', 'desc', 'metadata'].includes(tag)) return
    if (['defs', 'symbol'].includes(tag) && !referenced) return
    const resolved = resolveSvgStyle(element, parent, rules), style = resolved.style
    try { style['font-size'] = String(svgLength(style['font-size'], Number(parent['font-size']) || 16, 16)) } catch (error) { issue('font-size', error instanceof Error ? error.message : 'Invalid font size.') }
    for (const unsupported of resolved.unsupported) issue(`style-${unsupported}`, `Unsupported style ${unsupported}. Replace it in the source or exclude the affected object.`)
    for (const attr of element.attributes) if (/^on/iu.test(attr.name)) issue('event', 'Executable event attributes were removed. Review this object.', 'review')
    if (style.display === 'none' || Number(style.opacity) === 0) { scene.hiddenCount++; return }
    if (!Number.isFinite(Number(style.opacity)) || Number(style.opacity) < 0 || Number(style.opacity) > 1) issue('opacity', 'Invalid opacity. Correct the source opacity.')
    else if (Number(style.opacity) !== 1) issue('opacity', 'Partial/group opacity cannot be preserved. Make this artwork opaque in the source or exclude it.')
    for (const property of ['clip-path', 'mask', 'filter', 'marker-start', 'marker-mid', 'marker-end', 'transform']) if (style[property] && style[property] !== 'none') issue(property, `${property} is unsupported. Remove or expand the effect in the source.`)
    if (style['mix-blend-mode'] && style['mix-blend-mode'] !== 'normal') issue('blend', 'Blend modes are unsupported. Use opaque solid artwork.')
    let matrix = svgMultiply(parentMatrix, svgTransform(element.getAttribute('transform') ?? '')), localViewport = viewport
    const length = (attr: string, axis: 'x' | 'y' = 'x', fallback = 0) => svgLength(element.getAttribute(attr) ?? '', axis === 'x' ? localViewport.width : localViewport.height, fallback)
    if (tag === 'svg' || tag === 'symbol') {
      const box = viewBox(element)
      const w = element === root ? width : useSize?.width ?? length('width', 'x', box?.width ?? viewport.width)
      const h = element === root ? height : useSize?.height ?? length('height', 'y', box?.height ?? viewport.height)
      if (w <= 0 || h <= 0) { scene.hiddenCount++; return }
      matrix = svgMultiply(matrix, [1, 0, 0, 1, element === root ? 0 : length('x'), element === root ? 0 : length('y', 'y')])
      if (box) matrix = svgMultiply(matrix, viewportMatrix(box, w, h, element.getAttribute('preserveAspectRatio') ?? ''))
      localViewport = box ?? { x: 0, y: 0, width: w, height: h }
      if (element !== root && style.overflow !== 'visible') issue('viewport-clip', 'Nested viewport clipping needs review. Keep unclipped artwork or export the clipped shapes as paths.', 'review')
    }
    if (['g', 'svg', 'symbol', 'use', 'a'].includes(tag)) {
      const nextGroups = element === root ? groups : [...groups, id]
      if (element !== root) scene.groups.push({ id, name: label })
      if (tag === 'use') {
        const href = element.getAttribute('href') ?? element.getAttribute('xlink:href') ?? ''
        const target = href.startsWith('#') ? ids.get(href.slice(1)) : undefined
        if (!target || chain.has(target)) {
          issue('reference', 'Missing, external, or cyclic SVG reference. Expand this use in the source.')
          scene.nodes.push({ id, name: label, groups: nextGroups, matrix, style, contours: [], bounds: { x: 0, y: 0, width: 0, height: 0 }, findings }); return
        }
        const nextChain = new Set(chain); nextChain.add(target)
        yield* walk(target, style, svgMultiply(matrix, [1, 0, 0, 1, length('x'), length('y', 'y')]), nextGroups, findings, depth + 1, localViewport, nextChain, true, { width: length('width', 'x', viewBox(target)?.width ?? localViewport.width), height: length('height', 'y', viewBox(target)?.height ?? localViewport.height) })
      } else for (const child of element.children) yield* walk(child, style, matrix, nextGroups, findings, depth + 1, localViewport, chain)
      return
    }
    if (style.visibility === 'hidden' || style.visibility === 'collapse') { scene.hiddenCount++; return }
    const node: SvgSourceNode = { id, name: label, groups, matrix, style: { ...style }, contours: [], bounds: { x: 0, y: 0, width: 0, height: 0 }, findings }
    try {
      node.style['stroke-width'] = String(svgLength(style['stroke-width'], Math.hypot(localViewport.width, localViewport.height) / Math.SQRT2, 1))
      if (tag === 'line') { node.style = { ...node.style, fill: 'none' }; node.contours = lines([{ x: length('x1'), y: length('y1', 'y') }, { x: length('x2'), y: length('y2', 'y') }], false) }
      else if (tag === 'rect') {
        const x = length('x'), y = length('y', 'y'), w = length('width'), h = length('height', 'y')
        if (w < 0 || h < 0) throw new Error('Rectangle dimensions must not be negative.')
        if (!w || !h) { scene.hiddenCount++; return }
        const rx = Math.min(w / 2, length('rx', 'x', length('ry', 'y'))), ry = Math.min(h / 2, length('ry', 'y', rx))
        if (rx < 0 || ry < 0) throw new Error('Rounded rectangle radii must not be negative.')
        if (rx && ry) node.contours = parseSvgPath(`M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`, budget)
        else { node.shape = { kind: 'rect', x, y, width: w, height: h }; node.contours = lines([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], true) }
      } else if (tag === 'circle' || tag === 'ellipse') {
        const x = length('cx'), y = length('cy', 'y'), rx = length(tag === 'circle' ? 'r' : 'rx'), ry = tag === 'circle' ? rx : length('ry', 'y')
        if (rx < 0 || ry < 0) throw new Error('Circle/ellipse radii must not be negative.')
        if (!rx || !ry) { scene.hiddenCount++; return }
        node.contours = parseSvgPath(`M${x + rx} ${y}A${rx} ${ry} 0 1 1 ${x - rx} ${y}A${rx} ${ry} 0 1 1 ${x + rx} ${y}Z`, budget)
        if (tag === 'circle') node.shape = { kind: 'circle', x, y, radius: rx }
      } else if (tag === 'polyline' || tag === 'polygon') {
        const n = svgNumbers(element.getAttribute('points') ?? '')
        if (n.length % 2) throw new Error('Polygon points must contain coordinate pairs.')
        budget.commands += n.length / 2
        if (budget.commands > SVG_IMPORT_LIMITS.pathCommands) throw new Error('SVG point limit exceeded.')
        node.contours = lines(Array.from({ length: n.length / 2 }, (_, i) => ({ x: n[i * 2]!, y: n[i * 2 + 1]! })), tag === 'polygon')
      } else if (tag === 'path') node.contours = parseSvgPath(element.getAttribute('d') ?? '', budget)
      else if (tag === 'text') {
        let cursorX = length('x') + length('dx'), cursorY = length('y', 'y') + length('dy', 'y'), runIndex = 0
        const emit = (value: string, run: Element, runStyle: SvgStyle) => {
          const preserve = run.getAttribute('xml:space') === 'preserve' || element.getAttribute('xml:space') === 'preserve'
          const text = preserve ? value : value.replace(/[\t\r\n ]+/gu, ' ')
          if (!text) return
          if ([...text].length > 512) throw new Error('Text exceeds 512 characters. Split it into smaller labels in the source.')
          const runId = runIndex++ === 0 ? id : `${id}-run-${runIndex}`
          const runFindings = findings.map(f => ({ ...f, id: f.id.replace(id, runId), sourceId: runId }))
          const size = svgLength(runStyle['font-size'], Number(style['font-size']) || 16, 16)
          if (size <= 0) return
          const item: SvgSourceNode = { ...node, id: runId, name: run === element ? label : `${label} / ${runIndex}`, style: runStyle, findings: runFindings, text: { value: text, x: cursorX, y: cursorY, size } }
          const advance = text.length * size * 0.6
          const left = cursorX - (runStyle['text-anchor'] === 'middle' ? advance / 2 : runStyle['text-anchor'] === 'end' ? advance : 0)
          const p = [{ x: left, y: cursorY - size }, { x: left + advance, y: cursorY - size }, { x: left + advance, y: cursorY + size * 0.2 }, { x: left, y: cursorY + size * 0.2 }]
          item.bounds = svgBounds(p.map(p => svgPoint(matrix, p))); scene.nodes.push(item)
          cursorX += text.length * size * 0.6
        }
        for (const child of element.childNodes) {
          if (child.nodeType === 3) emit(child.textContent ?? '', element, style)
          else if (child.nodeType === 1) {
            const span = child as Element
            if (span.localName !== 'tspan' || span.children.length) { issue('text-layout', 'Complex text layout cannot be preserved. Export separate horizontal text runs.'); continue }
            if (span.hasAttribute('x')) cursorX = svgLength(span.getAttribute('x')!, localViewport.width)
            else issue('span-advance', 'Adjacent spans use estimated source advances. Review their spacing.', 'review')
            if (span.hasAttribute('y')) cursorY = svgLength(span.getAttribute('y')!, localViewport.height)
            cursorX += svgLength(span.getAttribute('dx') ?? '', localViewport.width); cursorY += svgLength(span.getAttribute('dy') ?? '', localViewport.height)
            const spanStyle = resolveSvgStyle(span, style, rules)
            if (spanStyle.unsupported.length || span.hasAttribute('transform')) issue('span-style', 'Unsupported text span styling. Export the span as a separate plain text element.')
            for (const attr of ['rotate', 'textLength', 'lengthAdjust']) if (span.hasAttribute(attr)) issue('text-layout', 'Per-character rotation/stretching is unsupported. Export separate horizontal labels.')
            emit(span.textContent ?? '', span, spanStyle.style)
          }
        }
        for (const attr of ['rotate', 'textLength', 'lengthAdjust']) if (element.hasAttribute(attr)) issue('text-layout', 'Per-character rotation/stretching is unsupported. Export separate horizontal labels.')
        // Findings discovered in later spans must also block earlier runs.
        for (const item of scene.nodes.filter(n => n.id === id || n.id.startsWith(`${id}-run-`))) for (const f of findings) if (!item.findings.some(i => i.message === f.message)) item.findings.push({ ...f, id: `${item.id}:${f.id}`, sourceId: item.id })
        if (!runIndex) { issue('empty-text', 'No horizontal text could be recovered. Export live text or exclude this object.'); scene.nodes.push(node) }
        return
      } else { issue('element', `SVG ${tag} cannot be converted. Replace it with solid paths/live text, or exclude it.`) }
      if ([...element.children].some(child => !['title', 'desc'].includes(child.localName))) issue('child-effect', 'This object contains animation or unsupported child content. Remove it in the source.')
      node.bounds = svgBounds(node.contours.flatMap(c => [svgPoint(matrix, c.start), ...c.segments.flatMap(s => svgCurveExtrema(s.points.map(p => svgPoint(matrix, p))))]))
    } catch (error) { issue('geometry', error instanceof Error ? error.message : 'Invalid SVG geometry.') }
    scene.nodes.push(node)
  }
  yield* walk(root, SVG_DEFAULT_STYLE, SVG_IDENTITY, [], [], 0, scene.viewport, new Set([root]))
  return scene
}
