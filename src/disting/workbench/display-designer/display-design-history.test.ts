import { describe, expect, it } from 'vitest'
import {
  DISPLAY_DESIGN_LIMITS,
  addDefaultDisplayDesignLayoutGrid,
  addDisplayDesignElement,
  createDefaultDisplayPrimitive,
  createEmptyDisplayDesign,
  createEmptyDisplayDesignSelection,
  createSequentialDisplayDesignIdFactory,
  type DisplayDesignDocument,
} from './display-design-model'
import {
  applyDisplayDesignTransaction,
  commitDisplayDesignTransaction,
  createDisplayDesignHistory,
  redoDisplayDesign,
  undoDisplayDesign,
} from './display-design-history'

function named(document: DisplayDesignDocument, name: string): DisplayDesignDocument {
  return { ...structuredClone(document), name }
}

describe('display design history', () => {
  it('records one owned entry per semantic operation and restores document plus selection', () => {
    const ids = createSequentialDisplayDesignIdFactory('history')
    const original = createEmptyDisplayDesign()
    const element = createDefaultDisplayPrimitive('pixel-line', ids)
    const added = addDisplayDesignElement(original, element)
    const history = commitDisplayDesignTransaction(createDisplayDesignHistory(original), {
      label: 'Create pixel line',
      document: added,
      selection: { ...createEmptyDisplayDesignSelection(), elementIds: [element.id] },
    })

    expect(history.past).toHaveLength(1)
    expect(history.past[0]?.label).toBe('Create pixel line')
    expect(history.present.selection.elementIds).toEqual([element.id])

    added.name = 'mutated caller value'
    expect(history.present.document.name).toBe('Untitled display')

    const undone = undoDisplayDesign(history)
    expect(undone.present.document.elements).toEqual([])
    expect(undone.present.selection.elementIds).toEqual([])
    expect(undone.future).toHaveLength(1)

    const redone = redoDisplayDesign(undone)
    expect(redone.present.document.elements).toHaveLength(1)
    expect(redone.present.selection.elementIds).toEqual([element.id])
    expect(redone.future).toEqual([])
  })

  it('does not create transactions for semantic no-ops', () => {
    const document = createEmptyDisplayDesign()
    const history = createDisplayDesignHistory(document)
    const committed = commitDisplayDesignTransaction(history, { label: 'No change', document: structuredClone(document) })
    expect(committed).toEqual(history)
    expect(committed).not.toBe(history)
  })

  it('treats layout-grid definition changes as undoable document edits', () => {
    const original = createEmptyDisplayDesign()
    const added = commitDisplayDesignTransaction(createDisplayDesignHistory(original), {
      label: 'Add layout grid',
      document: addDefaultDisplayDesignLayoutGrid(original),
    })

    expect(added.present.document.layoutGrid?.size).toBe(8)
    expect(added.past).toHaveLength(1)
    expect(undoDisplayDesign(added).present.document.layoutGrid).toBeNull()
    expect(redoDisplayDesign(undoDisplayDesign(added)).present.document.layoutGrid?.size).toBe(8)
  })

  it('runs operations against a defensive snapshot', () => {
    const history = createDisplayDesignHistory(createEmptyDisplayDesign())
    const committed = applyDisplayDesignTransaction(history, 'Rename design', (snapshot) => {
      snapshot.document.name = 'Edited locally'
      return snapshot
    })
    expect(committed.present.document.name).toBe('Edited locally')
    expect(history.present.document.name).toBe('Untitled display')
  })

  it('invalidates redo after a new edit', () => {
    let history = createDisplayDesignHistory(createEmptyDisplayDesign())
    history = commitDisplayDesignTransaction(history, { label: 'First', document: named(history.present.document, 'First') })
    history = commitDisplayDesignTransaction(history, { label: 'Second', document: named(history.present.document, 'Second') })
    history = undoDisplayDesign(history)
    expect(history.future).toHaveLength(1)
    history = commitDisplayDesignTransaction(history, { label: 'Branch', document: named(history.present.document, 'Branch') })
    expect(history.future).toEqual([])
    expect(redoDisplayDesign(history)).toEqual(history)
  })

  it('caps retained undo transactions at the documented limit without changing the present', () => {
    let history = createDisplayDesignHistory(createEmptyDisplayDesign())
    for (let index = 1; index <= DISPLAY_DESIGN_LIMITS.maximumHistoryTransactions + 7; index += 1) {
      history = commitDisplayDesignTransaction(history, {
        label: `Rename ${index}`,
        document: named(history.present.document, `Design ${index}`),
      })
    }

    expect(history.present.document.name).toBe(`Design ${DISPLAY_DESIGN_LIMITS.maximumHistoryTransactions + 7}`)
    expect(history.past).toHaveLength(DISPLAY_DESIGN_LIMITS.maximumHistoryTransactions)
    expect(history.past[0]?.label).toBe('Rename 8')

    for (let index = 0; index < DISPLAY_DESIGN_LIMITS.maximumHistoryTransactions + 5; index += 1) history = undoDisplayDesign(history)
    expect(history.present.document.name).toBe('Design 7')
    expect(history.past).toEqual([])
  })
})
