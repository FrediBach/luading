import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DISPLAY_COMPONENT_RECIPES } from '../src/disting/workbench/display-designer/display-component-catalog'
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
})
