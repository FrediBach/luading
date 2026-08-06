import { describe, expect, it } from 'vitest'
import {
  createDefaultDisplayPrimitive,
  createEmptyDisplayDesign,
  createSequentialDisplayDesignIdFactory,
  duplicateDisplayDesignElements,
  type DisplayDesignDocumentV1,
} from './display-design-model'
import {
  addDisplaySymbolVariant,
  createDisplaySymbolFromSelection,
  deleteDisplaySymbolVariant,
  deleteUsedDisplaySymbol,
  detachDisplaySymbolInstance,
  listDisplaySymbolUsages,
  makeDisplaySymbolStateDynamic,
  reorderDisplaySymbolVariant,
  setDefaultDisplaySymbolVariant,
  syncDisplaySymbolChoiceMap,
  updateDisplaySymbolVariant,
} from './display-design-symbols'

function symbolDocument(): { document: DisplayDesignDocumentV1; ids: ReturnType<typeof createSequentialDisplayDesignIdFactory> } {
  const ids = createSequentialDisplayDesignIdFactory('symbols')
  const box = createDefaultDisplayPrimitive('outline-box', ids)
  box.x1 = { kind: 'literal', value: 20 }
  box.y1 = { kind: 'literal', value: 30 }
  box.x2 = { kind: 'literal', value: 10 }
  box.y2 = { kind: 'literal', value: 18 }
  const text = createDefaultDisplayPrimitive('tiny-text', ids)
  text.x = { kind: 'literal', value: 12 }
  text.y = { kind: 'literal', value: 25 }
  return { document: { ...createEmptyDisplayDesign(), elements: [box, text] }, ids }
}

describe('display design symbols', () => {
  it('creates a symbol from reversed geometry at its top-left bound and supports an off-canvas origin override', () => {
    const { document, ids } = symbolDocument()
    const result = createDisplaySymbolFromSelection(document, document.elements.map(({ id }) => id), ids, {
      name: 'Status', origin: { x: -4, y: 70 },
    })
    expect(result.document.elements).toHaveLength(1)
    expect(result.instance).toMatchObject({ name: 'Status instance', x: { value: -4 }, y: { value: 70 } })
    expect(result.symbol?.luaName).toBe('draw_status')
    expect(result.symbol?.variants[0]?.elements[0]).toMatchObject({
      kind: 'box', x1: { value: 24 }, y1: { value: -40 }, x2: { value: 14 }, y2: { value: -52 },
    })
    expect(document.symbols).toEqual([])
  })

  it('keeps instances shared while definition edits propagate and duplicated instances retain the symbol reference', () => {
    const { document, ids } = symbolDocument()
    const created = createDisplaySymbolFromSelection(document, [document.elements[0]!.id], ids)
    const instance = created.instance!
    const duplicated = duplicateDisplayDesignElements(created.document, [instance.id], ids)
    const renamed = updateDisplaySymbolVariant(
      duplicated.document,
      created.symbol!.id,
      created.symbol!.defaultVariantId,
      (variant) => ({ ...variant, name: 'Renamed' }),
    )
    expect(renamed.elements).toHaveLength(3)
    expect(renamed.elements.filter((element) => element.kind === 'symbol-instance').map((element) => element.symbolId)).toEqual([
      created.symbol!.id, created.symbol!.id,
    ])
    expect(renamed.symbols[0]?.variants[0]?.name).toBe('Renamed')
    expect(listDisplaySymbolUsages(renamed)[0]).toMatchObject({ instanceCount: 2, unused: false })
  })

  it('adds duplicated and blank states with fresh IDs, stable Lua values, ordering, and default replacement', () => {
    const { document, ids } = symbolDocument()
    const created = createDisplaySymbolFromSelection(document, [document.elements[0]!.id], ids)
    const duplicated = addDisplaySymbolVariant(created.document, created.symbol!.id, ids, {
      sourceVariantId: created.symbol!.defaultVariantId, name: 'Active',
    })
    const blank = addDisplaySymbolVariant(duplicated.document, created.symbol!.id, ids, { blank: true, name: 'Warning' })
    const symbol = blank.document.symbols[0]!
    expect(symbol.variants.map(({ name, luaValue, elements }) => [name, luaValue, elements.length])).toEqual([
      ['Default', 'default', 1], ['Active', 'active', 1], ['Warning', 'warning', 0],
    ])
    expect(symbol.variants[1]!.elements[0]!.id).not.toBe(symbol.variants[0]!.elements[0]!.id)
    const renamed = updateDisplaySymbolVariant(blank.document, symbol.id, symbol.variants[1]!.id, (variant) => ({ ...variant, name: 'On' }))
    expect(renamed.symbols[0]?.variants[1]?.luaValue).toBe('active')
    const reordered = reorderDisplaySymbolVariant(renamed, symbol.id, 2, 0)
    const withDefault = setDefaultDisplaySymbolVariant(reordered, symbol.id, symbol.variants[1]!.id)
    expect(withDefault.symbols[0]?.variants.map(({ name }) => name)).toEqual(['Warning', 'Default', 'On'])
    expect(withDefault.symbols[0]?.defaultVariantId).toBe(symbol.variants[1]!.id)
  })

  it('creates complete dynamic state choices, repairs maps, and replaces every use when deleting a state', () => {
    const { document, ids } = symbolDocument()
    const created = createDisplaySymbolFromSelection(document, [document.elements[0]!.id], ids)
    const added = addDisplaySymbolVariant(created.document, created.symbol!.id, ids, { name: 'Active' })
    const dynamic = makeDisplaySymbolStateDynamic(added.document, created.instance!.id, ids)
    expect(dynamic.binding?.choices.map(({ luaValue }) => luaValue)).toEqual(['default', 'active'])
    const broken = structuredClone(dynamic.document)
    const instance = broken.elements.find((element) => element.kind === 'symbol-instance')!
    if (instance.kind === 'symbol-instance' && instance.state.kind === 'choice-binding') {
      delete instance.state.variantByChoiceId[dynamic.binding!.choices[1]!.id]
    }
    const synced = syncDisplaySymbolChoiceMap(broken, instance.id, ids)
    const syncedInstance = synced.elements.find((element) => element.kind === 'symbol-instance')!
    expect(syncedInstance.kind === 'symbol-instance' && syncedInstance.state.kind === 'choice-binding'
      ? Object.values(syncedInstance.state.variantByChoiceId)
      : []).toEqual(added.document.symbols[0]!.variants.map(({ id }) => id))
    const variants = synced.symbols[0]!.variants
    const deleted = deleteDisplaySymbolVariant(synced, synced.symbols[0]!.id, variants[0]!.id, variants[1]!.id)
    expect(deleted.symbols[0]?.variants).toHaveLength(1)
    expect(deleted.symbols[0]?.defaultVariantId).toBe(variants[1]!.id)
    const deletedInstance = deleted.elements.find((element) => element.kind === 'symbol-instance')!
    expect(deletedInstance.kind === 'symbol-instance' && deletedInstance.state.kind === 'choice-binding'
      ? new Set(Object.values(deletedInstance.state.variantByChoiceId))
      : undefined).toEqual(new Set([variants[1]!.id]))
  })

  it('synchronizes later symbol states into a shared choice binding only on explicit request', () => {
    const { document, ids } = symbolDocument()
    const created = createDisplaySymbolFromSelection(document, [document.elements[0]!.id], ids)
    const dynamic = makeDisplaySymbolStateDynamic(created.document, created.instance!.id, ids)
    const added = addDisplaySymbolVariant(dynamic.document, created.symbol!.id, ids, { blank: true, name: 'Warning' })
    const before = added.document.bindings.find(({ id }) => id === dynamic.binding!.id)
    expect(before?.kind === 'choice' ? before.choices.map(({ luaValue }) => luaValue) : []).toEqual(['default'])
    const synced = syncDisplaySymbolChoiceMap(added.document, created.instance!.id, ids)
    const after = synced.bindings.find(({ id }) => id === dynamic.binding!.id)
    expect(after?.kind === 'choice' ? after.choices.map(({ luaValue }) => luaValue) : []).toEqual(['default', 'warning'])
    const instance = synced.elements.find((element) => element.kind === 'symbol-instance')!
    expect(instance.kind === 'symbol-instance' && instance.state.kind === 'choice-binding'
      ? Object.values(instance.state.variantByChoiceId)
      : []).toEqual(synced.symbols[0]!.variants.map(({ id }) => id))
  })

  it('detaches only the preview state and supports both explicit used-symbol deletion choices', () => {
    const { document, ids } = symbolDocument()
    const created = createDisplaySymbolFromSelection(document, [document.elements[0]!.id], ids)
    const added = addDisplaySymbolVariant(created.document, created.symbol!.id, ids, { blank: true, name: 'Empty' })
    const detached = detachDisplaySymbolInstance(added.document, created.instance!.id, ids)
    expect(detached.elements[0]).toMatchObject({ kind: 'box', x1: { value: 20 }, y1: { value: 30 } })
    expect(detached.symbols).toHaveLength(1)

    const deleteInstances = deleteUsedDisplaySymbol(added.document, created.symbol!.id, 'delete-instances', ids)
    expect(deleteInstances.elements).toHaveLength(1)
    expect(deleteInstances.symbols).toEqual([])
    const detachInstances = deleteUsedDisplaySymbol(added.document, created.symbol!.id, 'detach-instances', ids)
    expect(detachInstances.elements.some((element) => element.kind === 'box')).toBe(true)
    expect(detachInstances.symbols).toEqual([])
  })
})
