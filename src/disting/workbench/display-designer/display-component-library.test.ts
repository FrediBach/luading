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
import { compileDisplayDesign, displayCommandBounds } from './display-design-compiler'
import { generateDisplayDesignLua } from './display-design-generator'
import { parseDisplayDesignText, serializeDisplayDesign } from './display-design-file'
import {
  DISPLAY_DESIGN_LIMITS,
  createDefaultDisplayPrimitive,
  createEmptyDisplayDesign,
  createSequentialDisplayDesignIdFactory,
  duplicateDisplayDesignElements,
  makeDisplaySymbolInstanceIndependent,
  type DisplayDesignDocument,
  type DisplayDesignSymbol,
} from './display-design-model'

const openEngines: Array<Awaited<ReturnType<typeof createDistingLuaTestEngine>>> = []

const SECOND_WAVE_COMPONENT_IDS = [
  'status-lamp',
  'bidirectional-jack',
  'horizontal-fader',
  'direction-badge',
  'clamp-processor',
  'segmented-meter',
  'playhead-cursor',
  'drum-step-cell',
  'i2c-activity',
] as const

const THIRD_WAVE_COMPONENT_IDS = [
  'divider-ruler',
  'stereo-jacks',
  'three-way-switch',
  'polarity-badge',
  'sample-hold-processor',
  'vertical-channel-meter',
  'loop-range-bracket',
  'fill-roll-indicator',
  'preset-state-marker',
] as const

const FOURTH_WAVE_COMPONENT_IDS = [
  'label-value-row',
  'normalled-pair',
  'bipolar-fader',
  'unit-badge',
  'logic-processor',
  'threshold-window-meter',
  'transport-strip',
  'drum-overview',
  'warning-error-banner',
] as const

const FIFTH_WAVE_COMPONENT_IDS = [
  'state-badge',
  'labelled-port-tile',
  'range-slider',
  'channel-voice-badge',
  'bernoulli-router',
  'modulation-range-meter',
  'pattern-page-strip',
  'punchy-snare-glyph',
  'busy-progress-indicator',
] as const

const SIXTH_WAVE_COMPONENT_IDS = [
  'segmented-selector',
  'split-multiple-node',
  'vertical-fader',
  'attenuverter-processor',
  'gate-trigger-activity',
  'tracker-row',
  'classic-snare-glyph',
] as const

const SEVENTH_WAVE_COMPONENT_IDS = [
  'page-indicator',
  'merge-mix-node',
  'rotary-knob',
  'slew-processor',
  'envelope-contour',
  'mini-keyboard-row',
  'punchy-kick-glyph',
] as const

const EIGHTH_WAVE_COMPONENT_IDS = [
  'focus-selection-brackets',
  'routing-matrix-cell',
  'encoder-ring',
  'pitch-quantizer-processor',
  'phase-clock-ring',
  'pitch-cv-lane',
  'classic-clap-glyph',
] as const

const NINTH_WAVE_COMPONENT_IDS = [
  'empty-unavailable-marker',
  'patch-link-flow-line',
  'xy-pad-vector-point',
  'comparator-processor',
  'note-range-ladder',
  'eight-step-gate-row',
  'punchy-clap-glyph',
] as const

const TENTH_WAVE_COMPONENT_IDS = [
  'bus-rail-tap',
  'soft-takeover-control',
  'clock-transform-processor',
  'xy-vector-meter',
  'probability-accent-lane',
  'classic-rim-claves-glyph',
] as const

const ELEVENTH_WAVE_COMPONENT_IDS = [
  'router-switch',
  'numeric-unit-readout',
  'feedback-utility',
  'bounded-scope-strip',
  'eight-step-euclidean-ring',
  'punchy-rim-claves-glyph',
] as const

const TWELFTH_WAVE_COMPONENT_IDS = [
  'send-return-loop',
  'choice-readout',
  'gain-vca-processor',
  'four-stage-strip',
  'classic-closed-hi-hat-glyph',
] as const

const FINAL_ATOMIC_COMPONENT_IDS = [
  'polarity-utility-processor',
  'crossfade-multiply-processor',
  'waveshaper-processor',
  'timing-utility-processor',
  'sampling-utility-processor',
  'quantization-utility-processor',
  'comparison-utility-processor',
  'probability-utility-processor',
  'switching-utility-processor',
  'classic-open-hi-hat-glyph',
  'classic-low-tom-glyph',
  'classic-mid-tom-glyph',
  'classic-high-tom-glyph',
  'classic-cymbal-ride-glyph',
  'classic-cowbell-glyph',
  'classic-shaker-maraca-glyph',
  'classic-generic-percussion-glyph',
  'punchy-closed-hi-hat-glyph',
  'punchy-open-hi-hat-glyph',
  'punchy-low-tom-glyph',
  'punchy-mid-tom-glyph',
  'punchy-high-tom-glyph',
  'punchy-cymbal-ride-glyph',
  'punchy-cowbell-glyph',
  'punchy-shaker-maraca-glyph',
  'punchy-generic-percussion-glyph',
] as const

const FINAL_ASSEMBLY_COMPONENT_IDS = ['sixteen-step-row', 'eight-step-drum-lane', 'radial-groove-ring'] as const

const IMPLEMENTED_WAVE_COMPONENT_IDS = [...SECOND_WAVE_COMPONENT_IDS, ...THIRD_WAVE_COMPONENT_IDS, ...FOURTH_WAVE_COMPONENT_IDS, ...FIFTH_WAVE_COMPONENT_IDS, ...SIXTH_WAVE_COMPONENT_IDS, ...SEVENTH_WAVE_COMPONENT_IDS, ...EIGHTH_WAVE_COMPONENT_IDS, ...NINTH_WAVE_COMPONENT_IDS, ...TENTH_WAVE_COMPONENT_IDS, ...ELEVENTH_WAVE_COMPONENT_IDS, ...TWELFTH_WAVE_COMPONENT_IDS, ...FINAL_ATOMIC_COMPONENT_IDS] as const

afterEach(() => {
  for (const lua of openEngines.splice(0)) lua.global.close()
})

function recipe(id: string) {
  const match = DISPLAY_COMPONENT_RECIPES.find((candidate) => candidate.id === id)
  if (!match) throw new Error(`Missing component recipe: ${id}`)
  return match
}

describe('display component library', () => {
  it('ships the expected valid recipes in every component category', () => {
    expect(validateDisplayComponentCatalog(DISPLAY_COMPONENT_RECIPES)).toEqual([])
    expect(DISPLAY_COMPONENT_RECIPES).toHaveLength(131)
    const expectedCategoryCounts = {
      layout: 10,
      patching: 13,
      controls: 16,
      signals: 6,
      processors: 22,
      meters: 12,
      sequencing: 14,
      drums: 32,
      status: 6,
    } as const
    for (const category of DISPLAY_COMPONENT_CATEGORIES) {
      expect(DISPLAY_COMPONENT_RECIPES.filter((candidate) => candidate.category === category.id).map(({ name }) => name)).toHaveLength(expectedCategoryCounts[category.id])
    }
    expect(SECOND_WAVE_COMPONENT_IDS.map((id) => recipe(id).id)).toEqual(SECOND_WAVE_COMPONENT_IDS)
    expect(THIRD_WAVE_COMPONENT_IDS.map((id) => recipe(id).id)).toEqual(THIRD_WAVE_COMPONENT_IDS)
    expect(FOURTH_WAVE_COMPONENT_IDS.map((id) => recipe(id).id)).toEqual(FOURTH_WAVE_COMPONENT_IDS)
    expect(FIFTH_WAVE_COMPONENT_IDS.map((id) => recipe(id).id)).toEqual(FIFTH_WAVE_COMPONENT_IDS)
    expect(SIXTH_WAVE_COMPONENT_IDS.map((id) => recipe(id).id)).toEqual(SIXTH_WAVE_COMPONENT_IDS)
    expect(SEVENTH_WAVE_COMPONENT_IDS.map((id) => recipe(id).id)).toEqual(SEVENTH_WAVE_COMPONENT_IDS)
    expect(EIGHTH_WAVE_COMPONENT_IDS.map((id) => recipe(id).id)).toEqual(EIGHTH_WAVE_COMPONENT_IDS)
    expect(NINTH_WAVE_COMPONENT_IDS.map((id) => recipe(id).id)).toEqual(NINTH_WAVE_COMPONENT_IDS)
    expect(TENTH_WAVE_COMPONENT_IDS.map((id) => recipe(id).id)).toEqual(TENTH_WAVE_COMPONENT_IDS)
    expect(ELEVENTH_WAVE_COMPONENT_IDS.map((id) => recipe(id).id)).toEqual(ELEVENTH_WAVE_COMPONENT_IDS)
    expect(TWELFTH_WAVE_COMPONENT_IDS.map((id) => recipe(id).id)).toEqual(TWELFTH_WAVE_COMPONENT_IDS)
    expect(FINAL_ATOMIC_COMPONENT_IDS.map((id) => recipe(id).id)).toEqual(FINAL_ATOMIC_COMPONENT_IDS)
    expect(FINAL_ASSEMBLY_COMPONENT_IDS.map((id) => recipe(id).id)).toEqual(FINAL_ASSEMBLY_COMPONENT_IDS)
  })

  it('filters by category, names, aliases, descriptions, and whitespace-only queries', () => {
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, '', 'drums').map(({ id }) => id)).toEqual([
      'eight-step-drum-lane',
      'radial-groove-ring',
      'drum-voice-glyph',
      'drum-voice-tile',
      'drum-step-cell',
      'fill-roll-indicator',
      'drum-overview',
      'punchy-snare-glyph',
      'classic-snare-glyph',
      'punchy-kick-glyph',
      'classic-clap-glyph',
      'punchy-clap-glyph',
      'classic-rim-claves-glyph',
      'punchy-rim-claves-glyph',
      'classic-closed-hi-hat-glyph',
      'classic-open-hi-hat-glyph',
      'classic-low-tom-glyph',
      'classic-mid-tom-glyph',
      'classic-high-tom-glyph',
      'classic-cymbal-ride-glyph',
      'classic-cowbell-glyph',
      'classic-shaker-maraca-glyph',
      'classic-generic-percussion-glyph',
      'punchy-closed-hi-hat-glyph',
      'punchy-open-hi-hat-glyph',
      'punchy-low-tom-glyph',
      'punchy-mid-tom-glyph',
      'punchy-high-tom-glyph',
      'punchy-cymbal-ride-glyph',
      'punchy-cowbell-glyph',
      'punchy-shaker-maraca-glyph',
      'punchy-generic-percussion-glyph',
    ])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, '808-like')).toHaveLength(13)
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, '909-like')).toHaveLength(14)
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, ' signed CV ').map(({ id }) => id)).toContain('bipolar-bar-meter')
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'configurable io').map(({ id }) => id)).toEqual(['bidirectional-jack'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'random voltage').map(({ id }) => id)).toEqual(['sample-hold-processor'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'comparator').map(({ id }) => id)).toEqual(['comparator-processor', 'comparison-utility-processor', 'threshold-window-meter'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'io overview').map(({ id }) => id)).toEqual(['labelled-port-tile'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'one to many').map(({ id }) => id)).toEqual(['split-multiple-node'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'tracker event').map(({ id }) => id)).toEqual(['tracker-row'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'many to one').map(({ id }) => id)).toEqual(['merge-mix-node'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'ADSR contour').map(({ id }) => id)).toEqual(['envelope-contour'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'crosspoint').map(({ id }) => id)).toEqual(['routing-matrix-cell'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'pitch grid').map(({ id }) => id)).toEqual(['pitch-quantizer-processor'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'no data').map(({ id }) => id)).toEqual(['empty-unavailable-marker'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'animated route').map(({ id }) => id)).toEqual(['patch-link-flow-line'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'two axis').map(({ id }) => id)).toEqual(['xy-pad-vector-point', 'xy-vector-meter'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'note range').map(({ id }) => id)).toEqual(['note-range-ladder'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'x0x').map(({ id }) => id)).toContain('eight-step-gate-row')
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'clock bus').map(({ id }) => id)).toEqual(['bus-rail-tap'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'pickup').map(({ id }) => id)).toEqual(['soft-takeover-control'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'clock transform').map(({ id }) => id)).toEqual(['clock-transform-processor'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'two channel cv').map(({ id }) => id)).toEqual(['xy-vector-meter'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'most-recent fired').map(({ id }) => id)).toEqual(['probability-accent-lane'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'one of n').map(({ id }) => id)).toEqual(['router-switch'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'formatted value').map(({ id }) => id)).toEqual(['numeric-unit-readout'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'tamer').map(({ id }) => id)).toEqual(['feedback-utility'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'bounded history').map(({ id }) => id)).toEqual(['bounded-scope-strip'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'eight-position Euclidean').map(({ id }) => id)).toEqual(['eight-step-euclidean-ring'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'punchy hybrid rim').map(({ id }) => id)).toEqual(['punchy-rim-claves-glyph'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'effects loop').map(({ id }) => id)).toEqual(['send-return-loop'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'choice readout').map(({ id }) => id)).toEqual(['choice-readout'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'amplifier').map(({ id }) => id)).toEqual(['gain-vca-processor'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'segment generator').map(({ id }) => id)).toEqual(['four-stage-strip'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'closed hi').map(({ id }) => id)).toEqual(['classic-closed-hi-hat-glyph', 'punchy-closed-hi-hat-glyph'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'shift register').map(({ id }) => id)).toEqual(['sampling-utility-processor'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'radial groove').map(({ id }) => id)).toEqual(['radial-groove-ring'])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, '   ')).toHaveLength(DISPLAY_COMPONENT_RECIPES.length)
  })

  it('filters by derived density and declared display-mode compatibility', () => {
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, '', 'all', 'screen').map(({ id }) => id)).toContain('radial-groove-ring')
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'radial groove', 'all', 'all', 'parameter-line')).toEqual([])
    expect(filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, 'radial groove', 'all', 'all', 'full-screen').map(({ id }) => id)).toEqual(['radial-groove-ring'])
  })

  it('rejects missing input guidance and incompatible display modes before mutating a design', () => {
    const source = recipe('radial-groove-ring')
    const malformed = {
      ...source,
      inputs: source.inputs.map((input, index) => index === 0 ? { ...input, sourceDomain: '' } : input),
    }
    expect(validateDisplayComponentCatalog([malformed]).map(({ message }) => message)).toContain('Input “outer1” needs Lua-name, source-domain, and affected-property guidance.')
    const original = createEmptyDisplayDesign()
    const result = materializeDisplayComponent(original, source, createSequentialDisplayDesignIdFactory('mode-reject'))
    expect(result).toMatchObject({ ok: false, message: 'Radial groove ring is not compatible with this display mode.' })
    expect(original).toEqual(createEmptyDisplayDesign())
  })

  it('keeps every added-wave state structurally distinct and within the atomic draw budget', () => {
    for (const recipeId of IMPLEMENTED_WAVE_COMPONENT_IDS) {
      const component = recipe(recipeId)
      const commandSignatures = component.states.map((state) => {
        const probe = {
          ...component,
          scenarios: [
            { id: 'default', name: 'Default', state: state.value },
            { id: 'active', name: 'Active', state: state.value },
            { id: 'edge', name: 'Edge', state: state.value },
          ],
        }
        const compiled = compileDisplayDesign(createDisplayComponentPreview(probe, 'default'))
        expect(compiled.findings.filter(({ severity }) => severity === 'error'), `${recipeId}/${state.value}`).toEqual([])
        expect(compiled.metrics.maximumVariantDrawCallCount, recipeId).toBeLessThanOrEqual(16)
        expect(compiled.metrics.smoothCallCount, recipeId).toBe(0)
        return JSON.stringify(compiled.commands)
      })
      expect(new Set(commandSignatures).size, recipeId).toBe(component.states.length)
    }
  })

  it('keeps bounded row and drum assemblies within document limits while exposing their higher exact costs', () => {
    for (const recipeId of FINAL_ASSEMBLY_COMPONENT_IDS) {
      const compiled = compileDisplayDesign(createDisplayComponentPreview(recipe(recipeId), 'active'))
      expect(compiled.findings.filter(({ severity }) => severity === 'error'), recipeId).toEqual([])
      expect(compiled.metrics.drawCallCount, recipeId).toBeGreaterThan(0)
      expect(compiled.metrics.smoothCallCount, recipeId).toBe(0)
      expect(recipe(recipeId).inputs.length, recipeId).toBeLessThan(DISPLAY_DESIGN_LIMITS.maximumBindings)
    }
  })

  it('materializes every scenario as ordinary valid version-9 symbols, bindings, and instances', () => {
    for (const component of DISPLAY_COMPONENT_RECIPES) {
      for (const scenario of component.scenarios) {
        const result = materializeDisplayComponent(
          { ...createEmptyDisplayDesign(), displayMode: component.compatibleDisplayModes.includes('parameter-line') ? 'parameter-line' : 'full-screen' },
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

  it('keeps every scenario rasterized within its declared footprint', () => {
    for (const component of DISPLAY_COMPONENT_RECIPES) {
      for (const scenario of component.scenarios) {
        const result = materializeDisplayComponent(
          { ...createEmptyDisplayDesign(), displayMode: 'full-screen' },
          component,
          createSequentialDisplayDesignIdFactory(`bounds-${component.id}-${scenario.id}`),
          { scenarioId: scenario.id, origin: { x: 0, y: 0 } },
        )
        expect(result.ok, `${component.id}/${scenario.id}`).toBe(true)
        if (!result.ok) continue
        for (const command of compileDisplayDesign(result.document).commands) {
          const bounds = displayCommandBounds(command)
          if (!bounds) continue
          expect(bounds.left, `${component.id}/${scenario.id}`).toBeGreaterThanOrEqual(0)
          expect(bounds.top, `${component.id}/${scenario.id}`).toBeGreaterThanOrEqual(0)
          expect(bounds.right, `${component.id}/${scenario.id}`).toBeLessThan(component.footprint.width)
          expect(bounds.bottom, `${component.id}/${scenario.id}`).toBeLessThan(component.footprint.height)
        }
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

  it('places centre insertions at the next open eight-pixel-grid position when the centre is occupied', () => {
    const ids = createSequentialDisplayDesignIdFactory('open-position')
    const first = materializeDisplayComponent(createEmptyDisplayDesign(), recipe('choice-readout'), ids)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = materializeDisplayComponent(first.document, recipe('choice-readout'), ids)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.instance.x).not.toEqual(first.instance.x)
    expect(second.instance.x.kind === 'literal' ? second.instance.x.value % 8 : -1).toBe(0)
    expect(second.instance.y.kind === 'literal' ? (second.instance.y.value - 10) % 8 : -1).toBe(0)
  })

  it('makes a duplicated component independent by cloning its symbol, choices, mappings, and used bindings', () => {
    const ids = createSequentialDisplayDesignIdFactory('independent-copy')
    const inserted = materializeDisplayComponent(createEmptyDisplayDesign(), recipe('input-jack'), ids, { scenarioId: 'active' })
    expect(inserted.ok).toBe(true)
    if (!inserted.ok) return
    const shared = duplicateDisplayDesignElements(inserted.document, [inserted.instance.id], ids)
    const independent = makeDisplaySymbolInstanceIndependent(shared.document, shared.duplicatedIds[0]!, ids)
    expect(independent.ok).toBe(true)
    if (!independent.ok) return

    expect(independent.document.symbols).toHaveLength(2)
    expect(independent.document.bindings).toHaveLength(inserted.document.bindings.length * 2)
    expect(independent.bindingIds.every((id) => !inserted.bindingIds.includes(id))).toBe(true)
    const copiedInstance = independent.document.elements.find(({ id }) => id === independent.instanceId)
    expect(copiedInstance).toMatchObject({ kind: 'symbol-instance', symbolId: independent.symbolId })
    expect(independent.summary).toContain('later artwork and preview-value edits are no longer shared')
    expect(compileDisplayDesign(independent.document).findings.filter(({ severity }) => severity === 'error')).toEqual([])
  })

  it('round-trips inserted components as ordinary canonical version-9 data without catalog provenance', () => {
    const inserted = materializeDisplayComponent(createEmptyDisplayDesign(), recipe('timing-utility-processor'), createSequentialDisplayDesignIdFactory('round-trip'), { scenarioId: 'active' })
    expect(inserted.ok).toBe(true)
    if (!inserted.ok) return
    const serialized = serializeDisplayDesign(inserted.document)
    expect(serialized.ok).toBe(true)
    if (!serialized.ok) return
    const parsed = parseDisplayDesignText(serialized.text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document).toEqual(inserted.document)
    expect(serialized.text).not.toContain('componentRecipe')
    expect(compileDisplayDesign(parsed.document).commands).toEqual(compileDisplayDesign(inserted.document).commands)
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
    const cases = [
      ['unipolar-bar-meter', 'active'],
      ['step-cell', 'edge'],
      ...IMPLEMENTED_WAVE_COMPONENT_IDS.map((id) => [id, 'active'] as const),
    ] as const
    for (const [recipeId, scenarioId] of cases) {
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
