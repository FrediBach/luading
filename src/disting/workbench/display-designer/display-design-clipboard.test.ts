import { describe, expect, it } from 'vitest'
import {
  activateDisplayDesignScreen,
  addDisplayDesignElement,
  addDisplayDesignGroup,
  addDisplayDesignScreen,
  assignDisplayDesignGroup,
  createDefaultDisplayGroup,
  createDefaultDisplayPrimitive,
  createEmptyDisplayDesign,
  createEmptyDisplayDesignSelection,
  createSequentialDisplayDesignIdFactory,
  type DisplayDesignDocument,
} from './display-design-model'
import { copyDisplayDesignSelection, pasteDisplayDesignClipboard } from './display-design-clipboard'

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

function documentWithTwoElements(): DisplayDesignDocument {
  const ids = createSequentialDisplayDesignIdFactory('source')
  let document = createEmptyDisplayDesign()
  document = addDisplayDesignElement(document, createDefaultDisplayPrimitive('pixel-line', ids))
  return addDisplayDesignElement(document, createDefaultDisplayPrimitive('filled-box', ids))
}

describe('display design clipboard', () => {
  it('copies a multi-selection defensively and pastes an offset clone in one selected set', () => {
    const document = deepFreeze(documentWithTwoElements())
    const selection = {
      ...createEmptyDisplayDesignSelection(),
      elementIds: document.elements.map(({ id }) => id),
    }
    const clipboard = copyDisplayDesignSelection(document, selection)!
    clipboard.elements[0]!.name = 'Changed clipboard value'
    const pasted = pasteDisplayDesignClipboard(
      document,
      createEmptyDisplayDesignSelection(),
      clipboard,
      createSequentialDisplayDesignIdFactory('paste'),
    )

    expect(document.elements[0]?.name).toBe('Pixel line')
    expect(pasted.ok).toBe(true)
    if (!pasted.ok) return
    expect(pasted.selection.elementIds).toEqual(['paste-element-1', 'paste-element-2'])
    expect(pasted.document.elements.map(({ name }) => name)).toEqual([
      'Pixel line', 'Filled box', 'Changed clipboard value copy', 'Filled box copy',
    ])
    expect(pasted.document.elements[2]).toMatchObject({
      kind: 'line',
      x1: { kind: 'literal', value: 10 },
      y1: { kind: 'literal', value: 18 },
      x2: { kind: 'literal', value: 34 },
      y2: { kind: 'literal', value: 18 },
    })
    expect(pasted.document.elements[3]).toMatchObject({
      kind: 'box',
      x1: { kind: 'literal', value: 10 },
      y1: { kind: 'literal', value: 18 },
      x2: { kind: 'literal', value: 34 },
      y2: { kind: 'literal', value: 26 },
    })
  })

  it('removes source-screen group membership when pasting onto another screen', () => {
    const ids = createSequentialDisplayDesignIdFactory('grouped')
    let document = documentWithTwoElements()
    const group = createDefaultDisplayGroup(ids, 'Meter')
    document = addDisplayDesignGroup(document, group)
    document = assignDisplayDesignGroup(document, document.elements.map(({ id }) => id), group.id)
    const clipboard = copyDisplayDesignSelection(document, {
      ...createEmptyDisplayDesignSelection(),
      elementIds: document.elements.map(({ id }) => id),
    })!
    const added = addDisplayDesignScreen(document, ids)
    document = activateDisplayDesignScreen(added.document, added.screen!.id)

    const pasted = pasteDisplayDesignClipboard(
      document,
      createEmptyDisplayDesignSelection(),
      clipboard,
      ids,
    )

    expect(pasted.ok).toBe(true)
    if (!pasted.ok) return
    expect(pasted.document.elements.filter(({ screenId }) => screenId === added.screen!.id)).toHaveLength(2)
    expect(pasted.document.elements.filter(({ screenId }) => screenId === added.screen!.id).every(({ groupId }) => groupId === undefined)).toBe(true)
  })

  it('pastes primitive layers into a symbol state but rejects nested symbol instances', () => {
    const ids = createSequentialDisplayDesignIdFactory('symbol')
    const source = createDefaultDisplayPrimitive('pixel-circle', ids)
    const document: DisplayDesignDocument = {
      ...createEmptyDisplayDesign(),
      symbols: [{
        id: 'symbol-1',
        name: 'Meter',
        luaName: 'meter',
        defaultVariantId: 'variant-1',
        variants: [{ id: 'variant-1', name: 'Default', luaValue: 'default', elements: [] }],
      }],
    }
    const destination = {
      ...createEmptyDisplayDesignSelection(),
      symbolId: 'symbol-1',
      variantId: 'variant-1',
      primitiveIds: [],
    }
    const pasted = pasteDisplayDesignClipboard(document, destination, { elements: [source] }, ids)
    expect(pasted.ok).toBe(true)
    if (!pasted.ok) return
    expect(pasted.selection.primitiveIds).toHaveLength(1)
    expect(pasted.document.symbols[0]?.variants[0]?.elements[0]).toMatchObject({
      kind: 'circle',
      name: 'Pixel circle copy',
      x: { kind: 'literal', value: 22 },
      y: { kind: 'literal', value: 22 },
    })

    const instance = {
      kind: 'symbol-instance' as const,
      id: 'instance-1',
      name: 'Meter instance',
      symbolId: 'symbol-1',
      x: { kind: 'literal' as const, value: 0 },
      y: { kind: 'literal' as const, value: 0 },
      visible: { kind: 'visible' as const },
      state: { kind: 'literal' as const, variantId: 'variant-1' },
    }
    expect(pasteDisplayDesignClipboard(document, destination, { elements: [instance] }, ids)).toEqual({
      ok: false,
      message: 'Symbol instances cannot be pasted inside a symbol state.',
    })
    expect(pasteDisplayDesignClipboard(
      { ...document, symbols: [] },
      createEmptyDisplayDesignSelection(),
      { elements: [instance] },
      ids,
    )).toEqual({
      ok: false,
      message: 'The copied layers cannot be pasted here: The instance references a missing symbol.',
    })
  })
})
