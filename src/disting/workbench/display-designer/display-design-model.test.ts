import { describe, expect, it } from 'vitest'
import {
  addDisplayDesignBinding,
  addDefaultDisplayDesignLayoutGrid,
  addDisplayDesignElement,
  addDisplayDesignGroup,
  addDisplayDesignScreen,
  activateDisplayDesignScreen,
  addDisplayDesignSymbol,
  assignDisplayDesignGroup,
  createDefaultDisplayBinding,
  createDefaultDisplayGroup,
  createDefaultDisplayPrimitive,
  createCollisionSafeDisplayDesignIdFactory,
  createEmptyDisplayDesign,
  createSequentialDisplayDesignIdFactory,
  deleteDisplayDesignBinding,
  deleteDisplayDesignElements,
  deleteDisplayDesignGroup,
  removeDisplayDesignLayoutGrid,
  deleteDisplayDesignSymbol,
  duplicateDisplayDesignElements,
  duplicateDisplayDesignGroup,
  duplicateDisplayDesignScreen,
  duplicateDisplayDesignSymbol,
  deleteDisplayDesignScreen,
  layerIndexToElementIndex,
  normalizeDisplayDesignSelection,
  reorderDisplayDesignElement,
  reorderDisplayDesignLayer,
  selectDisplayDesignElements,
  selectDisplayDesignGroups,
  selectDisplayDesignVariantPrimitives,
  setDisplayDesignMode,
  updateDisplayDesignBinding,
  updateDisplayDesignElement,
  updateDisplayDesignGroup,
  updateDisplayDesignLayoutGrid,
  updateDisplayDesignSymbol,
  type DisplayDesignDocument,
  type DisplayDesignSymbol,
} from './display-design-model'

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

function documentWithThreeElements(): DisplayDesignDocument {
  const ids = createSequentialDisplayDesignIdFactory('test')
  return {
    ...createEmptyDisplayDesign(),
    elements: [
      createDefaultDisplayPrimitive('pixel-line', ids),
      createDefaultDisplayPrimitive('outline-box', ids),
      createDefaultDisplayPrimitive('standard-text', ids),
    ],
  }
}

describe('display design model', () => {
  it('allocates collision-safe IDs after a portable design is opened', () => {
    const document = createEmptyDisplayDesign()
    document.elements = [{
      ...createDefaultDisplayPrimitive('pixel-line', () => 'designer-element-1'),
      id: 'designer-element-1',
    }]
    const ids = createCollisionSafeDisplayDesignIdFactory(document, 'designer')

    expect(ids('element')).toBe('designer-element-2')
    expect(ids('element')).toBe('designer-element-3')
  })

  it('creates a browser-only empty v9 document and deterministic scoped IDs', () => {
    const ids = createSequentialDisplayDesignIdFactory('scene')
    expect(createEmptyDisplayDesign()).toEqual({
      kind: 'luading-display-design',
      version: 9,
      name: 'Untitled display',
      displayMode: 'parameter-line',
      screens: [{ id: 'display-screen-1', name: 'Screen 1' }],
      activeScreenId: 'display-screen-1',
      elements: [],
      groups: [],
      tokens: [],
      bindings: [],
      symbols: [],
      layoutGrid: null,
    })
    expect([ids('element'), ids('variant'), ids('element')]).toEqual([
      'scene-element-1',
      'scene-variant-2',
      'scene-element-3',
    ])
  })

  it('adds, names, duplicates, activates, and removes independent screens', () => {
    const ids = createSequentialDisplayDesignIdFactory('screen')
    const first = addDisplayDesignElement(
      createEmptyDisplayDesign(),
      createDefaultDisplayPrimitive('pixel-line', ids),
    )
    const added = addDisplayDesignScreen(first, ids, 'Details')
    const withDetails = addDisplayDesignElement(
      added.document,
      createDefaultDisplayPrimitive('standard-text', ids),
    )
    const duplicated = duplicateDisplayDesignScreen(withDetails, added.screen.id, ids)

    expect(withDetails.screens.map(({ name }) => name)).toEqual(['Screen 1', 'Details'])
    expect(withDetails.elements.map(({ screenId }) => screenId)).toEqual(['display-screen-1', added.screen.id])
    expect(duplicated.screen).toMatchObject({ name: 'Details copy' })
    expect(duplicated.document.elements.filter(({ screenId }) => screenId === duplicated.screen?.id)).toHaveLength(1)

    const activated = activateDisplayDesignScreen(duplicated.document, 'display-screen-1')
    const removed = deleteDisplayDesignScreen(activated, added.screen.id)
    expect(activated.activeScreenId).toBe('display-screen-1')
    expect(removed.screens.map(({ name }) => name)).toEqual(['Screen 1', 'Details copy'])
    expect(removed.elements.some(({ screenId }) => screenId === added.screen.id)).toBe(false)
    expect(deleteDisplayDesignScreen(createEmptyDisplayDesign(), 'display-screen-1')).toEqual(createEmptyDisplayDesign())
  })

  it('adds, updates, and removes the singleton layout grid immutably', () => {
    const original = deepFreeze(createEmptyDisplayDesign())
    const added = addDefaultDisplayDesignLayoutGrid(original)
    const updated = updateDisplayDesignLayoutGrid(added, (grid) => ({
      ...grid,
      size: 16,
      color: '#123abc',
      opacity: 25,
    }))
    const removed = removeDisplayDesignLayoutGrid(updated)

    expect(added.layoutGrid).toEqual({ kind: 'uniform', size: 8, color: '#ff0000', opacity: 10 })
    expect(updated.layoutGrid).toEqual({ kind: 'uniform', size: 16, color: '#123abc', opacity: 25 })
    expect(removed.layoutGrid).toBeNull()
    expect(original.layoutGrid).toBeNull()
  })

  it('creates every supported primitive without impossible shape combinations', () => {
    const ids = createSequentialDisplayDesignIdFactory()
    const presets = [
      'pixel-line', 'smooth-line', 'animated-line', 'outline-box', 'filled-box',
      'pixel-box',
      'pixel-circle', 'smooth-circle', 'polygon', 'bezier', 'standard-text', 'tiny-text',
    ] as const
    const elements = presets.map((preset) => createDefaultDisplayPrimitive(preset, ids))

    expect(elements.map(({ kind }) => kind)).toEqual(['line', 'line', 'animated-line', 'box', 'box', 'pixel-box', 'circle', 'circle', 'polygon', 'bezier', 'text', 'text'])
    expect(elements.find((element) => element.kind === 'animated-line')).toMatchObject({ direction: 'right', speed: 10, secondaryShade: { kind: 'literal', value: 0 } })
    expect(elements.filter((element) => element.kind === 'line').map(({ smooth }) => smooth)).toEqual([false, true])
    expect(elements.filter((element) => element.kind === 'box').map(({ fill }) => fill)).toEqual([false, true])
    expect(elements.filter((element) => element.kind === 'circle').map(({ smooth }) => smooth)).toEqual([false, true])
    expect(elements.find((element) => element.kind === 'polygon')).toMatchObject({ sides: 6 })
    expect(elements.find((element) => element.kind === 'bezier')).toMatchObject({ segments: 24, points: expect.any(Array) })
    expect(elements.filter((element) => element.kind === 'text').map(({ tiny }) => tiny)).toEqual([false, true])
    expect(elements.find((element) => element.kind === 'pixel-box')).toMatchObject({
      width: 8, height: 8, frameRate: null, frames: [{ shades: Array(64).fill(15), duration: 1 }],
    })
    expect(new Set(elements.map(({ id }) => id)).size).toBe(12)
  })

  it('creates all binding kinds with valid stable defaults', () => {
    const ids = createSequentialDisplayDesignIdFactory('binding')
    const bindings = (['number', 'boolean', 'text', 'choice'] as const).map((kind) => createDefaultDisplayBinding(kind, ids))
    expect(bindings.map(({ kind }) => kind)).toEqual(['number', 'boolean', 'text', 'choice'])
    expect(bindings[3]).toMatchObject({
      kind: 'choice',
      previewChoiceId: 'binding-choice-5',
      choices: [{ id: 'binding-choice-5', luaValue: 'default' }],
    })
  })

  it('adds, updates, duplicates, deletes, and reorders elements without mutating frozen input', () => {
    const original = deepFreeze(documentWithThreeElements())
    const ids = createSequentialDisplayDesignIdFactory('copy')
    const added = addDisplayDesignElement(original, createDefaultDisplayPrimitive('pixel-circle', ids), 1)
    const updated = updateDisplayDesignElement(added, added.elements[0]!.id, (element) => ({ ...element, name: 'Lead' }))
    const duplicated = duplicateDisplayDesignElements(updated, [updated.elements[0]!.id, updated.elements[2]!.id], ids)
    const reordered = reorderDisplayDesignElement(duplicated.document, 0, duplicated.document.elements.length - 1)
    const deleted = deleteDisplayDesignElements(reordered, duplicated.duplicatedIds)

    expect(original.elements.map(({ name }) => name)).toEqual(['Pixel line', 'Outline box', 'Standard text'])
    expect(added.elements[1]?.kind).toBe('circle')
    expect(updated.elements[0]?.name).toBe('Lead')
    expect(duplicated.duplicatedIds).toEqual(['copy-element-2', 'copy-element-3'])
    expect(duplicated.document.elements.map(({ name }) => name)).toEqual([
      'Lead', 'Lead copy', 'Pixel circle', 'Outline box', 'Outline box copy', 'Standard text',
    ])
    expect(deleted.elements.at(-1)?.name).toBe('Lead')
    expect(deleted.elements).toHaveLength(4)
  })

  it('translates front-to-back layer positions to canonical back-to-front draw order', () => {
    const document = documentWithThreeElements()
    expect([0, 1, 2].map((index) => layerIndexToElementIndex(index, 3))).toEqual([2, 1, 0])
    expect(reorderDisplayDesignLayer(document, 0, 2).elements.map(({ name }) => name)).toEqual([
      'Standard text', 'Pixel line', 'Outline box',
    ])
  })

  it('supports group CRUD, assignment, and both explicit group deletion choices', () => {
    const document = documentWithThreeElements()
    const ids = createSequentialDisplayDesignIdFactory('group')
    const group = createDefaultDisplayGroup(ids)
    const grouped = assignDisplayDesignGroup(
      addDisplayDesignGroup(document, group),
      document.elements.slice(0, 2).map(({ id }) => id),
      group.id,
    )
    const renamed = updateDisplayDesignGroup(grouped, group.id, (current) => ({ ...current, name: 'Meter' }))
    const ungrouped = deleteDisplayDesignGroup(renamed, group.id, 'ungroup')
    const deleted = deleteDisplayDesignGroup(renamed, group.id, 'delete-elements')

    expect(renamed.groups[0]?.name).toBe('Meter')
    expect(ungrouped.groups).toEqual([])
    expect(ungrouped.elements).toHaveLength(3)
    expect(ungrouped.elements.every((element) => element.groupId === undefined)).toBe(true)
    expect(deleted.elements.map(({ name }) => name)).toEqual(['Standard text'])
  })

  it('duplicates groups and their members as one value-owned operation', () => {
    const document = documentWithThreeElements()
    const ids = createSequentialDisplayDesignIdFactory('group-copy')
    const group = createDefaultDisplayGroup(ids, 'Panel')
    const grouped = assignDisplayDesignGroup(addDisplayDesignGroup(document, group), [document.elements[0]!.id], group.id)
    const duplicate = duplicateDisplayDesignGroup(deepFreeze(grouped), group.id, ids)

    expect(duplicate.groupId).toBe('group-copy-group-2')
    expect(duplicate.duplicatedElementIds).toEqual(['group-copy-element-3'])
    expect(duplicate.document.groups.map(({ name }) => name)).toEqual(['Panel', 'Panel copy'])
    expect(duplicate.document.elements.map(({ name }) => name)).toEqual(['Pixel line', 'Pixel line copy', 'Outline box', 'Standard text'])
    expect(grouped.elements).toHaveLength(3)
  })

  it('provides immutable binding and symbol CRUD seams', () => {
    const ids = createSequentialDisplayDesignIdFactory('domain')
    const binding = createDefaultDisplayBinding('number', ids)
    const primitive = createDefaultDisplayPrimitive('filled-box', ids, 'primitive')
    const variantId = ids('variant')
    const symbol: DisplayDesignSymbol = {
      id: ids('symbol'),
      name: 'Meter',
      luaName: 'draw_meter',
      defaultVariantId: variantId,
      variants: [{ id: variantId, name: 'Default', luaValue: 'default', elements: [primitive] }],
    }
    const original = deepFreeze(createEmptyDisplayDesign())
    const withDomain = addDisplayDesignSymbol(addDisplayDesignBinding(original, binding), symbol)
    const updated = updateDisplayDesignSymbol(
      updateDisplayDesignBinding(withDomain, binding.id, (current) => ({ ...current, name: 'Level' })),
      symbol.id,
      (current) => ({ ...current, name: 'Level meter' }),
    )
    const deleted = deleteDisplayDesignSymbol(deleteDisplayDesignBinding(updated, binding.id), symbol.id)

    expect(updated.bindings[0]?.name).toBe('Level')
    expect(updated.symbols[0]?.name).toBe('Level meter')
    expect(withDomain.bindings[0]?.name).toBe('Value')
    expect(withDomain.symbols[0]?.name).toBe('Meter')
    expect(deleted.bindings).toEqual([])
    expect(deleted.symbols).toEqual([])
  })

  it('duplicates symbol definitions with fresh symbol, variant, and primitive IDs while instances remain shared', () => {
    const ids = createSequentialDisplayDesignIdFactory('symbol-copy')
    const firstVariantId = ids('variant')
    const secondVariantId = ids('variant')
    const symbol: DisplayDesignSymbol = {
      id: ids('symbol'), name: 'Indicator', luaName: 'draw_indicator', defaultVariantId: secondVariantId,
      variants: [
        { id: firstVariantId, name: 'Low', luaValue: 'low', elements: [createDefaultDisplayPrimitive('pixel-circle', ids, 'primitive')] },
        { id: secondVariantId, name: 'High', luaValue: 'high', elements: [createDefaultDisplayPrimitive('filled-box', ids, 'primitive')] },
      ],
    }
    const document = addDisplayDesignSymbol(createEmptyDisplayDesign(), symbol)
    const result = duplicateDisplayDesignSymbol(deepFreeze(document), symbol.id, ids)
    const duplicate = result.document.symbols[1]!

    expect(duplicate).toMatchObject({ name: 'Indicator copy', luaName: 'draw_indicator_copy' })
    expect(duplicate.id).not.toBe(symbol.id)
    expect(duplicate.variants.map(({ id }) => id)).not.toEqual(symbol.variants.map(({ id }) => id))
    expect(duplicate.variants.map(({ elements }) => elements[0]?.id)).not.toEqual(symbol.variants.map(({ elements }) => elements[0]?.id))
    expect(duplicate.defaultVariantId).toBe(duplicate.variants[1]?.id)
    expect(document.symbols).toEqual([symbol])
  })

  it('preserves geometry across mode changes and repairs selection against the current document', () => {
    const document = documentWithThreeElements()
    const fullScreen = setDisplayDesignMode(deepFreeze(document), 'full-screen')
    expect(fullScreen.displayMode).toBe('full-screen')
    expect(fullScreen.elements).toEqual(document.elements)

    expect(normalizeDisplayDesignSelection(document, {
      elementIds: [document.elements[1]!.id, document.elements[1]!.id, 'missing'],
      groupIds: ['missing'],
      symbolId: 'missing',
      variantId: 'missing',
      primitiveIds: ['missing'],
    })).toEqual({
      elementIds: [document.elements[1]!.id],
      groupIds: [],
      primitiveIds: [],
    })
  })

  it('supports replace, add, and toggle selection in scene, group, and symbol contexts', () => {
    const ids = createSequentialDisplayDesignIdFactory('selection')
    const group = createDefaultDisplayGroup(ids)
    const variantId = ids('variant')
    const primitive = createDefaultDisplayPrimitive('pixel-line', ids, 'primitive')
    const symbol: DisplayDesignSymbol = {
      id: ids('symbol'), name: 'Symbol', luaName: 'draw_symbol', defaultVariantId: variantId,
      variants: [{ id: variantId, name: 'Default', luaValue: 'default', elements: [primitive] }],
    }
    const document = addDisplayDesignSymbol(addDisplayDesignGroup(documentWithThreeElements(), group), symbol)
    const empty = normalizeDisplayDesignSelection(document, { elementIds: [], groupIds: [], primitiveIds: [] })
    const first = selectDisplayDesignElements(document, empty, [document.elements[0]!.id])
    const added = selectDisplayDesignElements(document, first, [document.elements[1]!.id], 'add')
    const toggled = selectDisplayDesignElements(document, added, [document.elements[0]!.id], 'toggle')
    const grouped = selectDisplayDesignGroups(document, toggled, [group.id], 'add')
    const symbolSelection = selectDisplayDesignVariantPrimitives(document, symbol.id, variantId, [primitive.id], 'replace', grouped)

    expect(first.elementIds).toEqual([document.elements[0]!.id])
    expect(added.elementIds).toEqual([document.elements[0]!.id, document.elements[1]!.id])
    expect(toggled.elementIds).toEqual([document.elements[1]!.id])
    expect(grouped.groupIds).toEqual([group.id])
    expect(symbolSelection).toEqual({
      elementIds: [], groupIds: [], symbolId: symbol.id, variantId, primitiveIds: [primitive.id],
    })
  })
})
