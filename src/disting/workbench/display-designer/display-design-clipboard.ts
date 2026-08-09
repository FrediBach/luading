import {
  activeDisplayDesignElements,
  activeDisplayDesignScreen,
  addDisplayDesignElement,
  cloneDisplayDesign,
  createEmptyDisplayDesignSelection,
  type DisplayDesignDocument,
  type DisplayDesignElement,
  type DisplayDesignIdFactory,
  type DisplayDesignSelection,
  type DisplayPrimitiveElement,
} from './display-design-model'
import { translateDisplayElement } from './display-design-geometry'
import { updateDisplaySymbolVariant } from './display-design-symbols'
import { validateDisplayDesign } from './display-design-validation'

export const DISPLAY_DESIGN_PASTE_OFFSET = 2

export interface DisplayDesignClipboard {
  elements: DisplayDesignElement[]
  sourceScreenId?: string
}

export type PasteDisplayDesignClipboardResult =
  | {
      ok: true
      document: DisplayDesignDocument
      selection: DisplayDesignSelection
      pastedCount: number
    }
  | {
      ok: false
      message: string
    }

function copiedName(name: string): string {
  const match = /^(.*?)(?: copy(?: (\d+))?)?$/.exec(name)
  const base = match?.[1] || name
  const copyNumber = match?.[2] ? Number(match[2]) + 1 : match?.[0] !== base ? 2 : 1
  return `${base} copy${copyNumber === 1 ? '' : ` ${copyNumber}`}`
}

function invalidPasteMessage(document: DisplayDesignDocument): string | undefined {
  const validation = validateDisplayDesign(document)
  const finding = validation.findings.find(({ severity }) => severity === 'error')
  return finding ? `The copied layers cannot be pasted here: ${finding.message}` : undefined
}

export function copyDisplayDesignSelection(
  document: DisplayDesignDocument,
  selection: DisplayDesignSelection,
): DisplayDesignClipboard | undefined {
  const selected = new Set(selection.symbolId && selection.variantId
    ? selection.primitiveIds
    : selection.elementIds)
  if (selected.size === 0) return undefined

  if (selection.symbolId && selection.variantId) {
    const variant = document.symbols
      .find(({ id }) => id === selection.symbolId)
      ?.variants.find(({ id }) => id === selection.variantId)
    const elements = variant?.elements.filter(({ id }) => selected.has(id)).map(cloneDisplayDesign) ?? []
    return elements.length > 0 ? { elements } : undefined
  }

  const elements = activeDisplayDesignElements(document)
    .filter(({ id }) => selected.has(id))
    .map(cloneDisplayDesign)
  return elements.length > 0
    ? { elements, sourceScreenId: activeDisplayDesignScreen(document).id }
    : undefined
}

export function pasteDisplayDesignClipboard(
  document: DisplayDesignDocument,
  selection: DisplayDesignSelection,
  clipboard: DisplayDesignClipboard,
  idFactory: DisplayDesignIdFactory,
  offset = DISPLAY_DESIGN_PASTE_OFFSET,
): PasteDisplayDesignClipboardResult {
  if (clipboard.elements.length === 0) return { ok: false, message: 'Nothing has been copied.' }

  if (selection.symbolId && selection.variantId) {
    const symbol = document.symbols.find(({ id }) => id === selection.symbolId)
    const variant = symbol?.variants.find(({ id }) => id === selection.variantId)
    if (!symbol || !variant) return { ok: false, message: 'The destination symbol state is no longer available.' }
    if (clipboard.elements.some(({ kind }) => kind === 'symbol-instance')) {
      return { ok: false, message: 'Symbol instances cannot be pasted inside a symbol state.' }
    }

    const primitives = clipboard.elements.map((element) => {
      const primitive = cloneDisplayDesign(element) as DisplayPrimitiveElement & {
        groupId?: string
        screenId?: string
      }
      primitive.id = idFactory('primitive')
      primitive.name = copiedName(primitive.name)
      delete primitive.groupId
      delete primitive.screenId
      return translateDisplayElement(primitive, offset, offset) as DisplayPrimitiveElement
    })
    const nextDocument = updateDisplaySymbolVariant(document, symbol.id, variant.id, (current) => ({
      ...current,
      elements: [...current.elements, ...primitives],
    }))
    const invalidMessage = invalidPasteMessage(nextDocument)
    if (invalidMessage) return { ok: false, message: invalidMessage }
    return {
      ok: true,
      document: nextDocument,
      selection: {
        ...createEmptyDisplayDesignSelection(),
        symbolId: symbol.id,
        variantId: variant.id,
        primitiveIds: primitives.map(({ id }) => id),
      },
      pastedCount: primitives.length,
    }
  }

  const destinationScreen = activeDisplayDesignScreen(document)
  const preserveGroup = clipboard.sourceScreenId === destinationScreen.id
  const destinationGroupIds = new Set(document.groups
    .filter(({ screenId }) => screenId === destinationScreen.id)
    .map(({ id }) => id))
  const pastedIds: string[] = []
  let nextDocument = cloneDisplayDesign(document)
  for (const source of clipboard.elements) {
    const element = cloneDisplayDesign(source)
    element.id = idFactory('element')
    element.name = copiedName(element.name)
    element.screenId = destinationScreen.id
    if (!preserveGroup || !element.groupId || !destinationGroupIds.has(element.groupId)) delete element.groupId
    const translated = translateDisplayElement(element, offset, offset)
    pastedIds.push(translated.id)
    nextDocument = addDisplayDesignElement(nextDocument, translated)
  }
  const invalidMessage = invalidPasteMessage(nextDocument)
  if (invalidMessage) return { ok: false, message: invalidMessage }
  return {
    ok: true,
    document: nextDocument,
    selection: { ...createEmptyDisplayDesignSelection(), elementIds: pastedIds },
    pastedCount: pastedIds.length,
  }
}
