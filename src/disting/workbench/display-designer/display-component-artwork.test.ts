import { describe, expect, it } from 'vitest'
import { renderDisplayTestPixels } from '../../testing/display-pixel-test-environment'
import { DISPLAY_COMPONENT_RECIPES } from './display-component-catalog'
import { PROCESSOR_GLYPHS } from './display-component-glyphs'
import { createDisplayComponentPreview, displayComponentPreviewLayout, type DisplayComponentScenarioValue } from './display-component-library'
import { compileDisplayDesign, displayCommandBounds } from './display-design-compiler'

function compile(id: string, state: string, values: Record<string, DisplayComponentScenarioValue> = {}) {
  const recipe = DISPLAY_COMPONENT_RECIPES.find((item) => item.id === id)!
  return compileDisplayDesign(createDisplayComponentPreview({
    ...recipe,
    scenarios: [...recipe.scenarios, { id: 'pixel-test', name: 'Pixel test', state, values }],
  }, 'pixel-test', { x: 0, y: 0 }))
}

const pixels = (id: string, state: string, values: Record<string, DisplayComponentScenarioValue> = {}) =>
  renderDisplayTestPixels(compile(id, state, values).commands)

describe('component artwork', () => {
  it('keeps all declared states on integer pixels inside their footprint at both input extremes', () => {
    for (const recipe of DISPLAY_COMPONENT_RECIPES) {
      for (const state of recipe.states) for (const edge of [0, 1]) {
        const values = Object.fromEntries(recipe.inputs.map((input) => [input.key,
          input.kind === 'number' ? edge : input.kind === 'boolean' ? true : input.defaultValue,
        ]))
        const compiled = compile(recipe.id, state.value, values)
        expect(compiled.findings.filter(({ severity }) => severity === 'error'), `${recipe.id}/${state.value}`).toEqual([])
        for (const command of compiled.commands) {
          const bounds = displayCommandBounds(command)
          if (!bounds) continue
          expect(Object.values(bounds).every(Number.isInteger), recipe.id).toBe(true)
          expect(bounds.left, recipe.id).toBeGreaterThanOrEqual(0)
          expect(bounds.top, recipe.id).toBeGreaterThanOrEqual(0)
          expect(bounds.right, recipe.id).toBeLessThan(recipe.footprint.width)
          expect(bounds.bottom, recipe.id).toBeLessThan(recipe.footprint.height)
        }
      }
    }
  })

  it('gives eight full meter segments equal widths and a one-pixel black gap', () => {
    const raster = pixels('segmented-meter', 'normal', { value: 1 })
    for (let x = 1; x <= 47; x += 1) expect(raster[4 * 256 + x], `column ${x}`).toBe(x % 6 === 0 ? 0 : 10)
  })

  it('shows no false fill at zero in horizontal, segmented, and vertical meters', () => {
    for (const id of ['unipolar-bar-meter', 'segmented-meter', 'vertical-channel-meter']) {
      const raster = pixels(id, 'normal', { value: 0, peak: 0 })
      expect(raster.includes(id === 'unipolar-bar-meter' ? 11 : 10), id).toBe(false)
    }
  })

  it('keeps port labels and signal types in separate rows, including the longest authored label', () => {
    const texts = compile('labelled-port-tile', 'output', { label: 'OUT1', signal: 'CV' }).commands.filter((command) => command.kind === 'text')
    expect(texts).toHaveLength(2)
    expect(displayCommandBounds(texts[0]!)!.bottom).toBeLessThan(displayCommandBounds(texts[1]!)!.top)
  })

  it('keeps processor symbols away from their labels and amount indicators', () => {
    for (const paths of Object.values(PROCESSOR_GLYPHS)) {
      for (const points of paths) for (const [x, y] of points) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(8)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(8)
      }
    }
    for (const recipe of DISPLAY_COMPONENT_RECIPES.filter((item) => item.id.includes('utility-processor') || ['waveshaper-processor', 'crossfade-multiply-processor'].includes(item.id))) {
      for (const state of recipe.states) {
        const compiled = compile(recipe.id, state.value)
        const label = compiled.commands.find((command) => command.kind === 'text')!
        expect(displayCommandBounds(label)!.left, `${recipe.id}/${state.value}`).toBeGreaterThan(17)
        expect(displayCommandBounds(label)!.bottom).toBeLessThan(12)
      }
    }
  })

  it('uses separate alert silhouettes instead of drawing a warning or error over a lamp ring', () => {
    for (const state of ['warning', 'error']) {
      expect(compile('status-lamp', state).commands.some((command) => command.kind === 'circle')).toBe(false)
    }
    expect(pixels('status-lamp', 'warning')[5 * 256 + 4]).toBe(15)
  })

  it('keeps a completed progress bar filled even when its numeric input is still at its default', () => {
    const raster = pixels('busy-progress-indicator', 'complete')
    expect(raster[9 * 256 + 44]).toBe(14)
  })

  it('preserves drum silhouettes during hit and accent states without overlapping micro labels', () => {
    for (const style of ['classic', 'punchy']) for (const instrument of ['open-hi-hat', 'low-tom', 'mid-tom', 'high-tom', 'cowbell', 'shaker-maraca']) {
      const id = `${style}-${instrument}-glyph`
      for (const state of ['idle', 'hit', 'accent']) expect(compile(id, state).commands.some((command) => command.kind === 'text'), id).toBe(false)
      expect(pixels(id, 'hit')[7 * 256]).toBe(15)
      expect(pixels(id, 'accent')[5]).toBe(15)
    }
  })

  it('uses integer preview magnification and keeps the entire footprint within the canvas', () => {
    for (const recipe of DISPLAY_COMPONENT_RECIPES) {
      const layout = displayComponentPreviewLayout(recipe.footprint)
      expect(Number.isInteger(layout.scale)).toBe(true)
      expect(layout.scale).toBeGreaterThanOrEqual(1)
      expect(layout.width).toBeLessThanOrEqual(256)
      expect(layout.height).toBeLessThanOrEqual(64)
      expect(layout.x + recipe.footprint.width).toBeLessThanOrEqual(layout.width)
      expect(layout.y + recipe.footprint.height).toBeLessThanOrEqual(layout.height)
    }
    expect(displayComponentPreviewLayout({ width: 16, height: 16 })).toEqual({ x: 4, y: 4, width: 24, height: 24, scale: 4 })
    expect(displayComponentPreviewLayout({ width: 256, height: 64 })).toEqual({ x: 0, y: 0, width: 256, height: 64, scale: 1 })
  })
})
