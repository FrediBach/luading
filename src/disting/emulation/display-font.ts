import type { TextAlignment } from '../types'
import { STANDARD_FONT_ATLAS } from './standard-font-atlas.generated'
import { TINY_FONT_ATLAS } from './tiny-font-atlas.generated'

export interface DistingFontGlyph {
  advance: number
  left: number
  top: number
  width: number
  height: number
  data: string
}

export interface DistingFontAtlas {
  pixelSize: number
  ascent: number
  descent: number
  lineHeight: number
  glyphs: Record<number, DistingFontGlyph>
}

export interface DistingTextPixel {
  x: number
  y: number
  coverage: number
}

const FALLBACK_CODEPOINT = '?'.codePointAt(0)!

function atlas(tiny: boolean) {
  return tiny ? TINY_FONT_ATLAS : STANDARD_FONT_ATLAS
}

function glyphFor(font: DistingFontAtlas, character: string) {
  const codepoint = character.codePointAt(0) ?? FALLBACK_CODEPOINT
  return font.glyphs[codepoint] ?? font.glyphs[FALLBACK_CODEPOINT]
}

export function measureDistingText(text: string, tiny: boolean) {
  const font = atlas(tiny)
  let width = 0

  for (const character of text) {
    width += glyphFor(font, character).advance
  }

  return width
}

function alignedStart(x: number, width: number, align: TextAlignment) {
  if (align === 'centre') return Math.round(x - width / 2)
  if (align === 'right') return x - width
  return x
}

export function rasterizeDistingText(
  x: number,
  baseline: number,
  text: string,
  tiny: boolean,
  align: TextAlignment,
) {
  const font = atlas(tiny)
  const pixels: DistingTextPixel[] = []
  let penX = alignedStart(x, measureDistingText(text, tiny), align)

  for (const character of text) {
    const glyph = glyphFor(font, character)
    const startX = penX + glyph.left
    const startY = baseline - glyph.top

    for (let row = 0; row < glyph.height; row += 1) {
      for (let column = 0; column < glyph.width; column += 1) {
        const coverage = Number.parseInt(glyph.data[row * glyph.width + column], 16)
        if (coverage > 0) {
          pixels.push({
            x: startX + column,
            y: startY + row,
            coverage,
          })
        }
      }
    }

    penX += glyph.advance
  }

  return pixels
}

export function fontAtlas(tiny: boolean) {
  return atlas(tiny)
}
