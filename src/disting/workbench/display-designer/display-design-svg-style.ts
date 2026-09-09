import type { SvgStyle } from './display-design-svg-model'

export const SVG_DEFAULT_STYLE: SvgStyle = {
  fill: 'black', stroke: 'none', color: 'black', 'stroke-width': '1', 'fill-rule': 'nonzero', opacity: '1',
  'fill-opacity': '1', 'stroke-opacity': '1', 'font-size': '16', 'font-family': 'sans-serif', 'text-anchor': 'start',
}
const PROPERTIES = new Set([...Object.keys(SVG_DEFAULT_STYLE), 'display', 'visibility', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'paint-order', 'font-weight', 'font-style', 'letter-spacing', 'word-spacing', 'dominant-baseline', 'alignment-baseline', 'baseline-shift', 'direction', 'unicode-bidi', 'writing-mode', 'text-decoration', 'vector-effect', 'clip-path', 'mask', 'filter', 'marker-start', 'marker-mid', 'marker-end', 'mix-blend-mode', 'transform', 'overflow', 'white-space'])
export interface SvgCssRule { selector: string; declarations: [string, string, boolean][]; specificity: number }
export function svgDeclarations(text: string): [string, string, boolean][] {
  return text.split(';').filter(p => p.trim()).map(declaration => {
    const colon = declaration.indexOf(':')
    if (colon < 0) throw new Error('Malformed SVG style declaration.')
    const key = declaration.slice(0, colon).trim().toLowerCase(), raw = declaration.slice(colon + 1).trim()
    return [key, raw.replace(/\s*!important\s*$/iu, ''), /!important\s*$/iu.test(raw)]
  })
}
export function svgCss(text: string): { rules: SvgCssRule[]; unsupported: boolean } {
  const clean = text.replace(/\/\*[\s\S]*?\*\//gu, '')
  const pattern = /([^{}]+)\{([^{}]*)\}/gu, rules: SvgCssRule[] = []
  let unsupported = Boolean(clean.replace(pattern, '').trim())
  for (const match of clean.matchAll(pattern)) {
    for (const selector of match[1]!.split(',').map(s => s.trim())) {
      if (!/^(?:[a-zA-Z][\w-]*|\.[\w-]+|#[\w-]+)$/u.test(selector)) { unsupported = true; continue }
      rules.push({ selector, declarations: svgDeclarations(match[2]!), specificity: selector[0] === '#' ? 100 : selector[0] === '.' ? 10 : 1 })
    }
  }
  return { rules, unsupported }
}
export function resolveSvgStyle(element: Element, parent: SvgStyle, rules: SvgCssRule[]): { style: SvgStyle; unsupported: string[] } {
  const style: SvgStyle = { ...parent, opacity: '1', display: 'inline', 'clip-path': 'none', mask: 'none', filter: 'none', 'mix-blend-mode': 'normal' }
  const ranks = new Map<string, number>(), unsupported: string[] = []
  const apply = (key: string, value: string, rank: number) => {
    if (!PROPERTIES.has(key) || /var\(|calc\(|url\(/iu.test(value)) { unsupported.push(`${key}: ${value}`); return }
    if ((ranks.get(key) ?? -1) > rank) return
    ranks.set(key, rank)
    style[key] = value === 'inherit' ? parent[key] ?? '' : value
  }
  for (const attr of element.attributes) if (PROPERTIES.has(attr.name)) apply(attr.name, attr.value, 0)
  rules.forEach((rule, index) => {
    const matches = rule.selector[0] === '#' ? element.id === rule.selector.slice(1) : rule.selector[0] === '.' ? element.getAttribute('class')?.split(/\s+/u).includes(rule.selector.slice(1)) : element.localName === rule.selector
    if (matches) for (const [key, value, important] of rule.declarations) apply(key, value, (important ? 1e9 : 0) + rule.specificity * 100_000 + index + 1)
  })
  for (const [key, value, important] of svgDeclarations(element.getAttribute('style') ?? '')) apply(key, value, (important ? 1e9 : 0) + 1e8)
  return { style, unsupported }
}

export function svgLength(value: string, reference: number, fallback = 0): number {
  if (!value.trim()) return fallback
  const match = value.trim().match(/^([-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?)(px|pt|pc|mm|cm|in|%)?$/u)
  if (!match) throw new Error(`Cannot resolve SVG length “${value}”. Use pixels or absolute lengths.`)
  const factors: Record<string, number> = { px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, '%': reference / 100 }
  const result = Number(match[1]) * (factors[match[2] ?? 'px'] ?? 1)
  if (!Number.isFinite(result) || Math.abs(result) > 1_000_000) throw new Error('SVG length is too large.')
  return result
}

const COLOURS: Record<string, string> = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', cyan: '#00ffff', aqua: '#00ffff', magenta: '#ff00ff', fuchsia: '#ff00ff', gray: '#808080', grey: '#808080', silver: '#c0c0c0', maroon: '#800000', olive: '#808000', lime: '#00ff00', teal: '#008080', navy: '#000080', purple: '#800080', orange: '#ffa500', rebeccapurple: '#663399' }
/** Rec.709 weighted sRGB channels, rounded to one of 16 authored shades. */
export function svgColour(value: string, currentColor = 'black'): { shade: number; alpha: number } | null {
  let color = value.trim().toLowerCase()
  if (color === 'none') return null
  if (color === 'transparent') return { shade: 0, alpha: 0 }
  if (color === 'currentcolor') color = currentColor.toLowerCase()
  color = COLOURS[color] ?? color
  let channels: number[], alpha = 1
  if (/^#[\da-f]{3,4}$/u.test(color)) { const c = [...color.slice(1)].map(n => parseInt(n + n, 16)); channels = c.slice(0, 3); alpha = (c[3] ?? 255) / 255 }
  else if (/^#[\da-f]{6}(?:[\da-f]{2})?$/u.test(color)) { channels = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)); alpha = color.length === 9 ? parseInt(color.slice(7), 16) / 255 : 1 }
  else {
    const match = color.match(/^rgba?\(([^)]+)\)$/u)
    if (!match) throw new Error(`Unsupported colour “${value}”. Use a solid RGB or hex colour.`)
    const components = match[1]!.split(/[\s,/]+/u).filter(Boolean)
    if (components.length < 3 || components.length > 4 || components.some(component => !/^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?%?$/u.test(component))) throw new Error('Invalid RGB colour.')
    channels = components.slice(0, 3).map(n => n.endsWith('%') ? parseFloat(n) * 2.55 : Number(n))
    if (components[3]) alpha = components[3].endsWith('%') ? parseFloat(components[3]) / 100 : Number(components[3])
  }
  if (channels.some(n => !Number.isFinite(n)) || !Number.isFinite(alpha)) throw new Error('Invalid SVG colour.')
  const [r, g, b] = channels.map(n => Math.max(0, Math.min(255, n)))
  return { shade: Math.round((0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255 * 15), alpha: Math.max(0, Math.min(1, alpha)) }
}
