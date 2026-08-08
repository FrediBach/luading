import { afterEach, describe, expect, it } from 'vitest'
import { DistingDisplayApi } from '../../emulation/display-api'
import { loadLuaProgramRuntime } from '../../emulation/lua-runtime'
import { createDistingLuaTestEngine } from '../../testing/lua-test-environment'
import { DISPLAY_COMPONENT_RECIPES } from './display-component-catalog'
import {
  DISPLAY_COMPONENT_CATEGORIES,
  createDisplayComponentPreview,
  filterDisplayComponentRecipes,
  materializeDisplayComponent,
  validateDisplayComponentCatalog,
} from './display-component-library'
import { compileDisplayDesign } from './display-design-compiler'
import { generateDisplayDesignLua } from './display-design-generator'
import {
  DISPLAY_DESIGN_LIMITS,
  createDefaultDisplayPrimitive,
  createEmptyDisplayDesign,
  createSequentialDisplayDesignIdFactory,
  type DisplayDesignDocument,
  type DisplayDesignSymbol,
} from './display-design-model'

const openEngines: Array<Awaited<ReturnType<typeof createDistingLuaTestEngine>>> = []

afterEach(() => {
  for (const lua of openEngines.splice(0)) lua.global.close()
})

function recipe(id: string) {
  const match = DISPLAY_COMPONENT_RECIPES.find((candidate) => candidate.id === id)
  if (!match) throw new Error(`Missing component recipe: ${id}`)
  return match
}

describe('display component library', () => {
  it('ships two valid starter recipes in every component category', () => {
    expect(validateDisplayComponentCatalog(DISPLAY_COMPONENT_RECIPES)).toEqual([])
    expect(DISPLAY_COMPONENT_RECIPES).toHaveLength(DISPLAY_COMPONENT_CATEGORIES.length * 2)
    for (const category of DISPLAY_COMPONENT_CATEGORIES) {
      expect(DISPLAY_COMPONENT_RECIPES.filter((candidate) => candidate.category === category.id).map(({ name }) => name)).toHaveLength(2)
    }
  })

  it('filters by category, names, aliases, descriptions, and whitespace-only queries', () => {
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, '', 'drums').map(({ id }) => id)).toEqual([
      'drum-voice-glyph',
      'drum-voice-tile',
    ])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, '808-like').map(({ id }) => id)).toEqual(['drum-voice-glyph'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, ' signed CV ').map(({ id }) => id)).toContain('bipolar-bar-meter')
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, '   ')).toHaveLength(DISPLAY_COMPONENT_RECIPES.length)
  })

  it('materializes every scenario as ordinary valid version-9 symbols, bindings, and instances', () => {
    for (const component of DISPLAY_COMPONENT_RECIPES) {
      for (const scenario of component.scenarios) {
        const result = materializeDisplayComponent(
          createEmptyDisplayDesign(),
          component,
          createSequentialDisplayDesignIdFactory(`${component.id}-${scenario.id}`),
          { scenarioId: scenario.id },
        )
        expect(result.ok, `${component.id}/${scenario.id}`).toBe(true)
        if (!result.ok) continue
        expect(result.document.version).toBe(9)
        expect(result.document.symbols).toHaveLength(1)
        expect(result.document.elements).toHaveLength(1)
        expect(result.document.bindings).toHaveLength(component.inputs.length + 1)
        expect(result.symbol.variants.map(({ luaValue }) => luaValue)).toEqual(component.states.map(({ value }) => value))
        expect(result.instance.state.kind).toBe('choice-binding')
        expect(compileDisplayDesign(result.document).commands.length).toBeGreaterThan(0)
      }
    }
  })

  it('keeps fresh insertions independently named and clamps placement to the active drawing area', () => {
    const ids = createSequentialDisplayDesignIdFactory('independent')
    const first = materializeDisplayComponent(
      createEmptyDisplayDesign(),
      recipe('unipolar-bar-meter'),
      ids,
      { scenarioId: 'active', origin: { x: -30, y: -30 } },
    )
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = materializeDisplayComponent(
      first.document,
      recipe('unipolar-bar-meter'),
      ids,
      { scenarioId: 'edge', origin: { x: 999, y: 999 } },
    )
    expect(second.ok).toBe(true)
    if (!second.ok) return

    expect(first.symbol.name).toBe('Unipolar bar meter')
    expect(second.symbol.name).toBe('Unipolar bar meter 2')
    expect(new Set([...first.bindingIds, ...second.bindingIds]).size).toBe(first.bindingIds.length + second.bindingIds.length)
    expect(second.document.bindings.map(({ luaName }) => luaName).every((name, index, names) => names.indexOf(name) === index)).toBe(true)
    expect(first.instance.x).toEqual({ kind: 'literal', value: 0 })
    expect(first.instance.y).toEqual({ kind: 'literal', value: 10 })
    expect(second.instance.x).toEqual({ kind: 'literal', value: 208 })
    expect(second.instance.y).toEqual({ kind: 'literal', value: 54 })
  })

  it('rejects an atomic insertion instead of exceeding document resource limits', () => {
    const ids = createSequentialDisplayDesignIdFactory('full')
    const symbols: DisplayDesignSymbol[] = Array.from({ length: DISPLAY_DESIGN_LIMITS.maximumSymbols }, (_, index) => {
      const variantId = ids('variant')
      return {
        id: ids('symbol'),
        name: `Symbol ${index + 1}`,
        luaName: `draw_full_${index + 1}`,
        defaultVariantId: variantId,
        variants: [{
          id: variantId,
          name: 'Default',
          luaValue: 'default',
          elements: [createDefaultDisplayPrimitive('pixel-line', ids, 'primitive')],
        }],
      }
    })
    const full: DisplayDesignDocument = { ...createEmptyDisplayDesign(), symbols }
    const result = materializeDisplayComponent(full, recipe('toggle-switch'), ids)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('cannot be inserted')
    expect(result.findings).toContain(`A design may contain at most ${DISPLAY_DESIGN_LIMITS.maximumSymbols} symbols.`)
    expect(full.symbols).toHaveLength(DISPLAY_DESIGN_LIMITS.maximumSymbols)
    expect(full.elements).toHaveLength(0)
  })

  it('keeps preview and generated component commands equal through the real Lua/display boundary', async () => {
    for (const [recipeId, scenarioId] of [['unipolar-bar-meter', 'active'], ['step-cell', 'edge']] as const) {
      const document = createDisplayComponentPreview(recipe(recipeId), scenarioId)
      const generated = generateDisplayDesignLua(document)
      expect(generated.ok).toBe(true)
      if (!generated.ok) continue

      const lua = await createDistingLuaTestEngine(50)
      openEngines.push(lua)
      const display = new DistingDisplayApi()
      display.register(lua.global)
      const runtime = await loadLuaProgramRuntime(lua, `return {\n${generated.source}}\n`)
      display.reset()
      expect(runtime.draw?.()).toBe(true)
      expect(display.commands).toEqual(compileDisplayDesign(document).commands)
      runtime.close?.()
    }
  })
})
