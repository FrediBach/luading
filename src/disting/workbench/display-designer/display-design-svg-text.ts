import { fontAtlas, measureDistingText, rasterizeDistingText } from '../../emulation/display-font'
import { svgBounds, svgFinding, type SvgBounds, type SvgFinding, type SvgNodeOverride, type SvgSourceNode } from './display-design-svg-model'
import type { DisplayTextAlignment } from './display-design-model'
export interface SvgTextCandidate { tiny: boolean; width: number; height: number; score: number; bounds: SvgBounds; fits: boolean }
export function matchSvgText(node: SvgSourceNode, scale: number, x: number, y: number, target: SvgBounds, override: SvgNodeOverride) {
  const value = override.text ?? node.text!.value
  const align: DisplayTextAlignment = node.style['text-anchor'] === 'middle' ? 'centre' : node.style['text-anchor'] === 'end' ? 'right' : 'left'
  const size = node.text!.size * Math.hypot(node.matrix[2], node.matrix[3]) * scale
  const targetHeight = Math.max(1, size * 0.75), targetWidth = Math.max(1, value.length * node.text!.size * 0.6 * Math.hypot(node.matrix[0], node.matrix[1]) * scale)
  const candidates: SvgTextCandidate[] = [false, true].map(tiny => {
    const pixels = rasterizeDistingText(x, y, value, tiny, align)
    const ink = svgBounds(pixels)
    const bounds = { ...ink, width: pixels.length ? ink.width + 1 : 0, height: pixels.length ? ink.height + 1 : 0 }
    const width = measureDistingText(value, tiny), height = bounds.height
    const fits = bounds.x >= target.x && bounds.y >= target.y && bounds.x + bounds.width <= target.x + target.width && bounds.y + bounds.height <= target.y + target.height
    return { tiny, width, height, bounds, fits, score: Math.abs(height - targetHeight) / targetHeight + 0.25 * Math.abs(width - targetWidth) / targetWidth + 0.5 * Math.abs(fontAtlas(tiny).pixelSize - size) / Math.max(1, size) }
  })
  const ordered = [...candidates].sort((a, b) => Number(b.fits) - Number(a.fits) || a.score - b.score || Number(a.tiny) - Number(b.tiny))
  const chosen = override.font && override.font !== 'auto' ? candidates.find(c => c.tiny === (override.font === 'tiny'))! : ordered[0]!
  const findings: SvgFinding[] = [svgFinding(node.id, 'native-font', 'Native text replaces the source typeface. Source dimensions are estimated; preview glyphs are not hardware-verified.', 'info')]
  const missing = [...new Set([...value].filter(c => !fontAtlas(chosen.tiny).glyphs[c.codePointAt(0)!]))]
  if (missing.length) findings.push(svgFinding(node.id, 'glyphs', `Unsupported native characters: ${missing.join(' ')}. Edit the text before importing.`))
  if (chosen.score > 0.65 && (!override.font || override.font === 'auto')) findings.push(svgFinding(node.id, 'text-size', 'Neither native size closely matches the source. Choose Standard/Tiny or accept the proposed replacement.', 'review'))
  if (!candidates.some(c => c.fits)) findings.push(svgFinding(node.id, 'text-fit', 'Neither native font fits here. Move/edit the label, choose another fit, or explicitly keep clipping.', 'review'))
  const m = node.matrix
  if ((Math.abs(m[1]) + Math.abs(m[2]) > 1e-7 || m[0] <= 0 || m[3] <= 0) && !override.horizontalText) findings.push(svgFinding(node.id, 'text-transform', 'Rotated, skewed or reflected text needs an explicit horizontal native-text replacement.'))
  for (const [property, allowed] of Object.entries({ direction: ['ltr'], 'unicode-bidi': ['normal'], 'writing-mode': ['horizontal-tb', 'lr', 'lr-tb'], 'dominant-baseline': ['auto', 'alphabetic'], 'alignment-baseline': ['auto', 'baseline', 'alphabetic'], 'baseline-shift': ['baseline', '0'], 'letter-spacing': ['normal', '0', '0px'], 'word-spacing': ['normal', '0', '0px'], 'text-decoration': ['none'] })) {
    if (node.style[property] && !allowed.includes(node.style[property]!)) findings.push(svgFinding(node.id, property, `Unsupported text ${property}. Export plain horizontal text.`))
  }
  return { value, align, candidates, chosen, findings }
}
