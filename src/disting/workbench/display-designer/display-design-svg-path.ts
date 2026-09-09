import { SVG_IDENTITY, SVG_IMPORT_LIMITS, svgMultiply, type SvgContour, type SvgMatrix, type SvgPoint } from './display-design-svg-model'

const NUMBER = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/gu
export function svgNumbers(input: string): number[] {
  const values = [...input.matchAll(NUMBER)].map(m => Number(m[0]))
  if (input.replace(NUMBER, '').replace(/[\s,]/gu, '') || values.some(n => !Number.isFinite(n) || Math.abs(n) > SVG_IMPORT_LIMITS.coordinate)) throw new Error('Invalid or oversized SVG number.')
  return values
}
export function svgTransform(input: string): SvgMatrix {
  let matrix = SVG_IDENTITY
  const pattern = /([a-zA-Z]+)\s*\(([^)]*)\)/gu
  const matches = [...input.matchAll(pattern)]
  if (input.replace(pattern, '').trim()) throw new Error('Unsupported SVG transform.')
  for (const match of matches) {
    const v = svgNumbers(match[2]!), name = match[1]
    let next: SvgMatrix
    if (name === 'matrix' && v.length === 6) next = v as SvgMatrix
    else if (name === 'translate' && (v.length === 1 || v.length === 2)) next = [1, 0, 0, 1, v[0]!, v[1] ?? 0]
    else if (name === 'scale' && (v.length === 1 || v.length === 2)) next = [v[0]!, 0, 0, v[1] ?? v[0]!, 0, 0]
    else if (name === 'rotate' && (v.length === 1 || v.length === 3)) {
      const angle = v[0]! * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle), x = v[1] ?? 0, y = v[2] ?? 0
      next = [c, s, -s, c, x - c * x + s * y, y - s * x - c * y]
    } else if ((name === 'skewX' || name === 'skewY') && v.length === 1) {
      const t = Math.tan(v[0]! * Math.PI / 180)
      next = name === 'skewX' ? [1, 0, t, 1, 0, 0] : [1, t, 0, 1, 0, 0]
    } else throw new Error('Unsupported SVG transform arguments.')
    matrix = svgMultiply(matrix, next)
    if (matrix.some(n => !Number.isFinite(n) || Math.abs(n) > SVG_IMPORT_LIMITS.coordinate)) throw new Error('SVG transform is too large.')
  }
  return matrix
}

/** SVG endpoint arcs converted to cubic segments of at most 90 degrees. */
export function svgArc(from: SvgPoint, rxInput: number, ryInput: number, rotation: number, large: number, sweep: number, to: SvgPoint): SvgPoint[][] {
  if (from.x === to.x && from.y === to.y) return []
  let rx = Math.abs(rxInput), ry = Math.abs(ryInput)
  if (!rx || !ry) return [[from, to]]
  const phi = rotation * Math.PI / 180, c = Math.cos(phi), s = Math.sin(phi)
  const dx = (from.x - to.x) / 2, dy = (from.y - to.y) / 2
  const xp = c * dx + s * dy, yp = -s * dx + c * dy
  const lambda = xp * xp / (rx * rx) + yp * yp / (ry * ry)
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda) }
  const numerator = Math.max(0, rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp)
  const coefficient = (large === sweep ? -1 : 1) * Math.sqrt(numerator / (rx * rx * yp * yp + ry * ry * xp * xp))
  const cxp = coefficient * rx * yp / ry, cyp = -coefficient * ry * xp / rx
  const cx = c * cxp - s * cyp + (from.x + to.x) / 2, cy = s * cxp + c * cyp + (from.y + to.y) / 2
  const start = Math.atan2((yp - cyp) / ry, (xp - cxp) / rx)
  let delta = Math.atan2((-yp - cyp) / ry, (-xp - cxp) / rx) - start
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  if (sweep && delta < 0) delta += 2 * Math.PI
  const count = Math.ceil(Math.abs(delta) / (Math.PI / 2))
  const point = (a: number): SvgPoint => ({ x: cx + c * rx * Math.cos(a) - s * ry * Math.sin(a), y: cy + s * rx * Math.cos(a) + c * ry * Math.sin(a) })
  const derivative = (a: number): SvgPoint => ({ x: -c * rx * Math.sin(a) - s * ry * Math.cos(a), y: -s * rx * Math.sin(a) + c * ry * Math.cos(a) })
  const result: SvgPoint[][] = []
  for (let i = 0; i < count; i++) {
    const a = start + delta * i / count, b = start + delta * (i + 1) / count, k = 4 / 3 * Math.tan((b - a) / 4)
    const p = point(a), q = point(b), d = derivative(a), e = derivative(b)
    result.push([i === 0 ? from : p, { x: p.x + k * d.x, y: p.y + k * d.y }, { x: q.x - k * e.x, y: q.y - k * e.y }, i === count - 1 ? to : q])
  }
  return result
}

export function parseSvgPath(input: string, budget = { commands: 0 }): SvgContour[] {
  const tokens = input.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/gu) ?? []
  if (input.replace(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/gu, '').replace(/[\s,]/gu, '')) throw new Error('Invalid SVG path data.')
  const contours: SvgContour[] = []
  let i = 0, command = '', previous = '', current: SvgPoint = { x: 0, y: 0 }, control: SvgPoint | undefined
  let contour: SvgContour | undefined
  const number = () => { const n = Number(tokens[i++]); if (!Number.isFinite(n) || Math.abs(n) > SVG_IMPORT_LIMITS.coordinate) throw new Error('Invalid SVG path coordinate.'); return n }
  while (i < tokens.length) {
    if (/^[a-z]$/iu.test(tokens[i]!)) command = tokens[i++]!
    else if (!command) throw new Error('SVG path must start with a command.')
    const upper = command.toUpperCase(), relative = upper !== command
    if (++budget.commands > SVG_IMPORT_LIMITS.pathCommands) throw new Error('SVG path command limit exceeded. Simplify the source paths.')
    if (previous === 'Z' && upper !== 'M' && upper !== 'Z') { contour = { start: current, segments: [], closed: false }; contours.push(contour) }
    const origin = { ...current }
    const point = (): SvgPoint => ({ x: number() + (relative ? origin.x : 0), y: number() + (relative ? origin.y : 0) })
    const line = (to: SvgPoint) => { contour!.segments.push({ points: [current, to] }); current = to }
    const reflect = () => control ? { x: 2 * current.x - control.x, y: 2 * current.y - control.y } : { ...current }
    if (upper === 'M') {
      current = point(); contour = { start: current, segments: [], closed: false }; contours.push(contour); command = relative ? 'l' : 'L'; control = undefined
    } else {
      if (!contour) throw new Error('SVG path must begin with moveto.')
      if (upper === 'Z') { if (current.x !== contour.start.x || current.y !== contour.start.y) line(contour.start); contour.closed = true; command = ''; control = undefined }
      else if (upper === 'L') { line(point()); control = undefined }
      else if (upper === 'H') { line({ x: number() + (relative ? origin.x : 0), y: current.y }); control = undefined }
      else if (upper === 'V') { line({ x: current.x, y: number() + (relative ? origin.y : 0) }); control = undefined }
      else if (upper === 'C' || upper === 'S') {
        const a = upper === 'C' ? point() : ['C', 'S'].includes(previous) ? reflect() : current, b = point(), to = point()
        contour.segments.push({ points: [current, a, b, to] }); current = to; control = b
      } else if (upper === 'Q' || upper === 'T') {
        const a = upper === 'Q' ? point() : ['Q', 'T'].includes(previous) ? reflect() : current, to = point()
        contour.segments.push({ points: [current, a, to] }); current = to; control = a
      } else if (upper === 'A') {
        const flag = () => { const token = tokens[i] ?? ''; if (token[0] !== '0' && token[0] !== '1') throw new Error('SVG arc flags must be 0 or 1.'); const value = Number(token[0]); if (token.length > 1) tokens[i] = token.slice(1); else i++; return value }
        const rx = number(), ry = number(), rotation = number(), large = flag(), sweep = flag(), to = point()
        if (![large, sweep].every(n => n === 0 || n === 1)) throw new Error('SVG arc flags must be 0 or 1.')
        contour.segments.push(...svgArc(current, rx, ry, rotation, large, sweep, to).map(points => ({ points }))); current = to; control = undefined
      } else throw new Error(`Unsupported SVG path command ${command}.`)
    }
    previous = upper
  }
  return contours
}

/** Include derivative extrema, not off-curve control handles, in artwork bounds. */
export function svgCurveExtrema(points: SvgPoint[]): SvgPoint[] {
  const amounts = new Set([0, 1])
  for (const axis of ['x', 'y'] as const) {
    const p = points.map(point => point[axis])
    const roots: number[] = []
    if (p.length === 3) {
      const divisor = p[0]! - 2 * p[1]! + p[2]!
      if (divisor) roots.push((p[0]! - p[1]!) / divisor)
    } else if (p.length === 4) {
      const a = -p[0]! + 3 * p[1]! - 3 * p[2]! + p[3]!
      const b = 2 * (p[0]! - 2 * p[1]! + p[2]!)
      const c = p[1]! - p[0]!
      if (Math.abs(a) < 1e-12) { if (b) roots.push(-c / b) }
      else {
        const discriminant = b * b - 4 * a * c
        if (discriminant >= 0) roots.push((-b + Math.sqrt(discriminant)) / (2 * a), (-b - Math.sqrt(discriminant)) / (2 * a))
      }
    }
    for (const amount of roots) if (amount > 0 && amount < 1) amounts.add(amount)
  }
  return [...amounts].map(amount => {
    const working = points.map(point => ({ ...point }))
    for (let level = working.length - 1; level > 0; level--) for (let i = 0; i < level; i++) {
      working[i]!.x += (working[i + 1]!.x - working[i]!.x) * amount
      working[i]!.y += (working[i + 1]!.y - working[i]!.y) * amount
    }
    return working[0] ?? { x: 0, y: 0 }
  })
}
