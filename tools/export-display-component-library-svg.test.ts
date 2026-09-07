import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DISPLAY_COMPONENT_RECIPES } from '../src/disting/workbench/display-designer/display-component-catalog'
import { createDisplayComponentPreview } from '../src/disting/workbench/display-designer/display-component-library'
import { compileDisplayDesign } from '../src/disting/workbench/display-designer/display-design-compiler'
import { renderDisplayTestPixels } from '../src/disting/testing/display-pixel-test-environment'
import {
  DEFAULT_PIXEL_UI_SVG_PATH,
  generateDisplayComponentLibrarySvg,
} from './export-display-component-library-svg'

describe('pixel UI SVG export', () => {
  it('exports every component and declared state as named, editable SVG groups', () => {
    const svg = generateDisplayComponentLibrarySvg()
    const expectedVariants = DISPLAY_COMPONENT_RECIPES.reduce((sum, recipe) => sum + recipe.states.length, 0)

    expect(svg).toContain(`${DISPLAY_COMPONENT_RECIPES.length} components · ${expectedVariants} declared state variants`)
    expect(svg.match(/data-component-id=/gu)).toHaveLength(expectedVariants)
    expect(svg).toContain('data-name="Disting 16-shade palette"')
    expect(svg).toContain('data-name="Pixel artwork"')
    expect(svg).not.toContain('unsupported smooth')
    for (const recipe of DISPLAY_COMPONENT_RECIPES) {
      expect(svg).toContain(`id="component-${recipe.id}"`)
      for (const state of recipe.states) expect(svg).toContain(`data-component-id="${recipe.id}" data-state="${state.value}"`)
    }
  })

  it('keeps the checked-in Figma artifact synchronized with the catalog', () => {
    expect(readFileSync(DEFAULT_PIXEL_UI_SVG_PATH, 'utf8')).toBe(generateDisplayComponentLibrarySvg())
  })

  it('preserves black knockout artwork and the authored state examples', () => {
    const svg = generateDisplayComponentLibrarySvg()
    const state = (id: string, value: string) => svg.split(`data-component-id="${id}" data-state="${value}"`)[1]!.split('<g id="component-')[0]!
    expect(state('state-badge', 'active')).toContain('fill="#000000" data-shade="0"')
    expect(state('segmented-meter', 'normal')).toContain('data-name="Segment divider 6"><rect')
    expect(state('input-jack', 'patched')).toMatch(/data-name="Input activity[^"]*"><rect/u)
  })

  it('matches the production renderer pixel for pixel for every exported state', () => {
    const svg = generateDisplayComponentLibrarySvg()
    for (const recipe of DISPLAY_COMPONENT_RECIPES) for (const state of recipe.states) {
      const variant = svg.split(`data-component-id="${recipe.id}" data-state="${state.value}">`)[1]!.split('</g></g>')[0]!
      const { width, height } = recipe.footprint
      const actual = new Uint8Array(width * height)
      for (const match of variant.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="1" fill="#[0-9a-f]+" data-shade="(\d+)"/gu)) {
        const [, x, y, length, shade] = match.map(Number)
        actual.fill(shade!, y! * width + x!, y! * width + x! + length!)
      }
      const document = createDisplayComponentPreview({
        ...recipe,
        scenarios: [...recipe.scenarios, {
          id: 'export-test', name: state.name, state: state.value,
          values: recipe.scenarios.find((scenario) => scenario.state === state.value)?.values,
        }],
      }, 'export-test', { x: 0, y: 0 })
      const expected = renderDisplayTestPixels(compileDisplayDesign(document).commands, width, height)
      expect(actual, `${recipe.id}/${state.value}`).toEqual(expected)
    }
  })
})
