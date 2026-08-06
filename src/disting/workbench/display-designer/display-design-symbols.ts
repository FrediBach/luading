import { createDisplayBindingInDocument } from './display-design-bindings'
import { displaySelectionBounds } from './display-design-geometry'
import { allocateDisplayLuaIdentifier } from './display-design-lua-identifiers'
import {
  cloneDisplayDesign,
  type DisplayChoiceBinding,
  type DisplayDesignDocument,
  type DisplayDesignElement,
  type DisplayDesignIdFactory,
  type DisplayDesignSymbol,
  type DisplayPrimitiveElement,
  type DisplayScalar,
  type DisplaySymbolInstance,
  type DisplaySymbolVariant,
} from './display-design-model'
import { createDisplayBindingMap, resolveDisplayScalar } from './display-design-resolution'

export interface CreateDisplaySymbolOptions {
  name?: string
  origin?: { x: number; y: number }
}

export interface DisplaySymbolUsage {
  symbolId: string
  instanceCount: number
  unused: boolean
}

const literal = (value: number): DisplayScalar => ({ kind: 'literal', value })

function translatedScalar(value: DisplayScalar, delta: number): DisplayScalar {
  return value.kind === 'literal'
    ? literal(value.value + delta)
    : { ...cloneDisplayDesign(value), from: value.from + delta, to: value.to + delta }
}

export function translateDisplayPrimitive(
  primitive: DisplayPrimitiveElement,
  dx: number,
  dy: number,
): DisplayPrimitiveElement {
  const next = cloneDisplayDesign(primitive)
  if (next.kind === 'line' || next.kind === 'box') {
    next.x1 = translatedScalar(next.x1, dx)
    next.y1 = translatedScalar(next.y1, dy)
    next.x2 = translatedScalar(next.x2, dx)
    next.y2 = translatedScalar(next.y2, dy)
  } else {
    next.x = translatedScalar(next.x, dx)
    next.y = translatedScalar(next.y, dy)
  }
  return next
}

export function listDisplaySymbolUsages(document: DisplayDesignDocument): DisplaySymbolUsage[] {
  const counts = new Map<string, number>()
  for (const element of document.elements) {
    if (element.kind === 'symbol-instance') counts.set(element.symbolId, (counts.get(element.symbolId) ?? 0) + 1)
  }
  return document.symbols.map((symbol) => ({
    symbolId: symbol.id,
    instanceCount: counts.get(symbol.id) ?? 0,
    unused: !counts.has(symbol.id),
  }))
}

export function createDisplaySymbolFromSelection(
  document: DisplayDesignDocument,
  elementIds: Iterable<string>,
  idFactory: DisplayDesignIdFactory,
  options: CreateDisplaySymbolOptions = {},
): { document: DisplayDesignDocument; symbol?: DisplayDesignSymbol; instance?: DisplaySymbolInstance } {
  const selectedIds = new Set(elementIds)
  const selected = document.elements.filter((element): element is DisplayPrimitiveElement & { groupId?: string } => (
    selectedIds.has(element.id) && element.kind !== 'symbol-instance'
  ))
  if (selected.length === 0 || selected.length !== selectedIds.size) return { document: cloneDisplayDesign(document) }
  const bounds = displaySelectionBounds(document, selectedIds)
  if (!bounds) return { document: cloneDisplayDesign(document) }
  const origin = options.origin ?? { x: bounds.left, y: bounds.top }
  const name = options.name?.trim() || 'Symbol'
  const variantId = idFactory('variant')
  const symbol: DisplayDesignSymbol = {
    id: idFactory('symbol'),
    name,
    luaName: allocateDisplayLuaIdentifier(
      `draw_${name}`,
      [...document.bindings.map(({ luaName }) => luaName), ...document.symbols.map(({ luaName }) => luaName)],
      'draw_symbol',
    ),
    defaultVariantId: variantId,
    variants: [{
      id: variantId,
      name: 'Default',
      luaValue: 'default',
      elements: selected.map((element) => {
        const primitive = translateDisplayPrimitive(element, -origin.x, -origin.y)
        primitive.id = idFactory('primitive')
        delete (primitive as DisplayPrimitiveElement & { groupId?: string }).groupId
        return primitive
      }),
    }],
  }
  const instance: DisplaySymbolInstance = {
    kind: 'symbol-instance',
    id: idFactory('element'),
    name: `${name} instance`,
    symbolId: symbol.id,
    x: literal(origin.x),
    y: literal(origin.y),
    visible: { kind: 'visible' },
    state: { kind: 'literal', variantId },
  }
  const firstIndex = document.elements.findIndex(({ id }) => selectedIds.has(id))
  const elements = document.elements.filter(({ id }) => !selectedIds.has(id)).map(cloneDisplayDesign)
  elements.splice(firstIndex, 0, instance)
  return {
    document: { ...cloneDisplayDesign(document), elements, symbols: [...cloneDisplayDesign(document.symbols), symbol] },
    symbol: cloneDisplayDesign(symbol),
    instance: cloneDisplayDesign(instance),
  }
}

function uniqueVariantValue(symbol: DisplayDesignSymbol, requested: string): string {
  const base = requested.trim() || 'state'
  const used = new Set(symbol.variants.map(({ luaValue }) => luaValue))
  if (!used.has(base)) return base
  let suffix = 2
  while (used.has(`${base}_${suffix}`)) suffix += 1
  return `${base}_${suffix}`
}

export function addDisplaySymbolVariant(
  document: DisplayDesignDocument,
  symbolId: string,
  idFactory: DisplayDesignIdFactory,
  options: { sourceVariantId?: string; blank?: boolean; name?: string } = {},
): { document: DisplayDesignDocument; variantId?: string } {
  let variantId: string | undefined
  const symbols = document.symbols.map((symbol) => {
    if (symbol.id !== symbolId) return cloneDisplayDesign(symbol)
    const source = symbol.variants.find(({ id }) => id === options.sourceVariantId) ?? symbol.variants[0]
    variantId = idFactory('variant')
    const name = options.name?.trim() || (options.blank ? 'New state' : `${source?.name ?? 'State'} copy`)
    const variant: DisplaySymbolVariant = {
      id: variantId,
      name,
      luaValue: uniqueVariantValue(symbol, name.toLowerCase().replace(/[^a-z0-9]+/gu, '_').replace(/^_+|_+$/gu, '') || 'state'),
      elements: options.blank || !source ? [] : source.elements.map((primitive) => ({
        ...cloneDisplayDesign(primitive),
        id: idFactory('primitive'),
      })),
    }
    return { ...cloneDisplayDesign(symbol), variants: [...cloneDisplayDesign(symbol.variants), variant] }
  })
  return { document: { ...cloneDisplayDesign(document), symbols }, ...(variantId ? { variantId } : {}) }
}

export function updateDisplaySymbolVariant(
  document: DisplayDesignDocument,
  symbolId: string,
  variantId: string,
  update: (variant: DisplaySymbolVariant) => DisplaySymbolVariant,
): DisplayDesignDocument {
  return {
    ...cloneDisplayDesign(document),
    symbols: document.symbols.map((symbol) => symbol.id === symbolId ? {
      ...cloneDisplayDesign(symbol),
      variants: symbol.variants.map((variant) => variant.id === variantId
        ? cloneDisplayDesign(update(cloneDisplayDesign(variant)))
        : cloneDisplayDesign(variant)),
    } : cloneDisplayDesign(symbol)),
  }
}

export function reorderDisplaySymbolVariant(
  document: DisplayDesignDocument,
  symbolId: string,
  fromIndex: number,
  toIndex: number,
): DisplayDesignDocument {
  return {
    ...cloneDisplayDesign(document),
    symbols: document.symbols.map((symbol) => {
      if (symbol.id !== symbolId || fromIndex < 0 || fromIndex >= symbol.variants.length) return cloneDisplayDesign(symbol)
      const variants = cloneDisplayDesign(symbol.variants)
      const [variant] = variants.splice(fromIndex, 1)
      variants.splice(Math.max(0, Math.min(toIndex, variants.length)), 0, variant)
      return { ...cloneDisplayDesign(symbol), variants }
    }),
  }
}

export function setDefaultDisplaySymbolVariant(
  document: DisplayDesignDocument,
  symbolId: string,
  variantId: string,
): DisplayDesignDocument {
  return {
    ...cloneDisplayDesign(document),
    symbols: document.symbols.map((symbol) => symbol.id === symbolId && symbol.variants.some(({ id }) => id === variantId)
      ? { ...cloneDisplayDesign(symbol), defaultVariantId: variantId }
      : cloneDisplayDesign(symbol)),
  }
}

export function syncDisplaySymbolChoiceMap(
  document: DisplayDesignDocument,
  elementId: string,
  idFactory?: DisplayDesignIdFactory,
): DisplayDesignDocument {
  const target = document.elements.find((element): element is DisplaySymbolInstance => element.id === elementId && element.kind === 'symbol-instance')
  if (!target || target.state.kind !== 'choice-binding') return cloneDisplayDesign(document)
  const targetState = target.state
  const targetSymbol = document.symbols.find(({ id }) => id === target.symbolId)
  const targetBinding = document.bindings.find(({ id }) => id === targetState.bindingId)
  if (!targetSymbol || targetBinding?.kind !== 'choice') return cloneDisplayDesign(document)
  const previousByValue = new Map(targetBinding.choices.map((choice) => [choice.luaValue, choice]))
  const usedIds = new Set([
    ...document.elements.map(({ id }) => id),
    ...document.groups.map(({ id }) => id),
    ...document.bindings.flatMap((binding) => binding.kind === 'choice' ? [binding.id, ...binding.choices.map(({ id }) => id)] : [binding.id]),
    ...document.symbols.flatMap((symbol) => [symbol.id, ...symbol.variants.flatMap((variant) => [variant.id, ...variant.elements.map(({ id }) => id)])]),
  ])
  let nextChoiceId = 1
  const allocateChoiceId = () => {
    if (idFactory) return idFactory('choice')
    while (usedIds.has(`synced-choice-${nextChoiceId}`)) nextChoiceId += 1
    return `synced-choice-${nextChoiceId++}`
  }
  const choices = targetSymbol.variants.map((variant) => {
    const previous = previousByValue.get(variant.luaValue)
    return previous ? cloneDisplayDesign(previous) : { id: allocateChoiceId(), name: variant.name, luaValue: variant.luaValue }
  })
  const previewLuaValue = targetBinding.choices.find(({ id }) => id === targetBinding.previewChoiceId)?.luaValue
  const previewChoiceId = choices.find(({ luaValue }) => luaValue === previewLuaValue)?.id ?? choices[0]?.id ?? ''
  return {
    ...cloneDisplayDesign(document),
    bindings: document.bindings.map((binding) => binding.id === targetBinding.id
      ? { ...cloneDisplayDesign(targetBinding), choices, previewChoiceId }
      : cloneDisplayDesign(binding)),
    elements: document.elements.map((element) => {
      if (element.kind !== 'symbol-instance' || element.state.kind !== 'choice-binding' || element.state.bindingId !== targetBinding.id) return cloneDisplayDesign(element)
      const symbol = document.symbols.find(({ id }) => id === element.symbolId)
      if (!symbol) return cloneDisplayDesign(element)
      const elementState = element.state
      const byValue = new Map(symbol.variants.map((variant) => [variant.luaValue, variant.id]))
      const variantIds = new Set(symbol.variants.map(({ id }) => id))
      return {
        ...cloneDisplayDesign(element),
        state: {
          ...cloneDisplayDesign(elementState),
          variantByChoiceId: Object.fromEntries(choices.map((choice) => [
            choice.id,
            variantIds.has(elementState.variantByChoiceId[choice.id])
              ? elementState.variantByChoiceId[choice.id]
              : byValue.get(choice.luaValue) ?? symbol.defaultVariantId,
          ])),
        },
      }
    }),
  }
}

export function makeDisplaySymbolStateDynamic(
  document: DisplayDesignDocument,
  elementId: string,
  idFactory: DisplayDesignIdFactory,
): { document: DisplayDesignDocument; binding?: DisplayChoiceBinding } {
  const instance = document.elements.find((element): element is DisplaySymbolInstance => element.id === elementId && element.kind === 'symbol-instance')
  const symbol = instance && document.symbols.find(({ id }) => id === instance.symbolId)
  if (!instance || !symbol) return { document: cloneDisplayDesign(document) }
  const created = createDisplayBindingInDocument(document, 'choice', idFactory, `${symbol.name} state`)
  if (created.binding.kind !== 'choice') return { document: cloneDisplayDesign(document) }
  const choices = symbol.variants.map((variant) => ({ id: idFactory('choice'), name: variant.name, luaValue: variant.luaValue }))
  const literalId = instance.state.kind === 'literal' ? instance.state.variantId : symbol.defaultVariantId
  const previewChoiceId = choices[symbol.variants.findIndex(({ id }) => id === literalId)]?.id ?? choices[0]?.id ?? ''
  const binding: DisplayChoiceBinding = { ...created.binding, choices, previewChoiceId }
  const bindings = created.document.bindings.map((candidate) => candidate.id === binding.id ? binding : candidate)
  const variantByChoiceId = Object.fromEntries(choices.map((choice, index) => [choice.id, symbol.variants[index].id]))
  const elements = created.document.elements.map((element) => element.id === elementId && element.kind === 'symbol-instance'
    ? { ...cloneDisplayDesign(element), state: { kind: 'choice-binding' as const, bindingId: binding.id, variantByChoiceId } }
    : cloneDisplayDesign(element))
  return { document: { ...cloneDisplayDesign(created.document), bindings, elements }, binding: cloneDisplayDesign(binding) }
}

export function detachDisplaySymbolInstance(
  document: DisplayDesignDocument,
  elementId: string,
  idFactory: DisplayDesignIdFactory,
): DisplayDesignDocument {
  const bindings = createDisplayBindingMap(document.bindings)
  const index = document.elements.findIndex(({ id }) => id === elementId)
  const instance = document.elements[index]
  if (!instance || instance.kind !== 'symbol-instance') return cloneDisplayDesign(document)
  const symbol = document.symbols.find(({ id }) => id === instance.symbolId)
  if (!symbol) return cloneDisplayDesign(document)
  let variantId = symbol.defaultVariantId
  if (instance.state.kind === 'literal') variantId = instance.state.variantId
  else {
    const binding = bindings.get(instance.state.bindingId)
    if (binding?.kind === 'choice') variantId = instance.state.variantByChoiceId[binding.previewChoiceId] ?? variantId
  }
  const variant = symbol.variants.find(({ id }) => id === variantId) ?? symbol.variants.find(({ id }) => id === symbol.defaultVariantId)
  if (!variant) return cloneDisplayDesign(document)
  const x = resolveDisplayScalar(instance.x, bindings)
  const y = resolveDisplayScalar(instance.y, bindings)
  const detached: DisplayDesignElement[] = variant.elements.map((primitive) => {
    const next = translateDisplayPrimitive(primitive, x, y) as DisplayPrimitiveElement & { groupId?: string }
    next.id = idFactory('element')
    if (instance.groupId) next.groupId = instance.groupId
    return next
  })
  const elements = cloneDisplayDesign(document.elements)
  elements.splice(index, 1, ...detached)
  return { ...cloneDisplayDesign(document), elements }
}

export function deleteDisplaySymbolVariant(
  document: DisplayDesignDocument,
  symbolId: string,
  variantId: string,
  replacementVariantId: string,
): DisplayDesignDocument {
  const symbol = document.symbols.find(({ id }) => id === symbolId)
  if (!symbol || symbol.variants.length <= 1 || variantId === replacementVariantId || !symbol.variants.some(({ id }) => id === replacementVariantId)) return cloneDisplayDesign(document)
  const symbols = document.symbols.map((candidate) => candidate.id === symbolId ? {
    ...cloneDisplayDesign(candidate),
    defaultVariantId: candidate.defaultVariantId === variantId ? replacementVariantId : candidate.defaultVariantId,
    variants: candidate.variants.filter(({ id }) => id !== variantId).map(cloneDisplayDesign),
  } : cloneDisplayDesign(candidate))
  const elements = document.elements.map((element) => {
    if (element.kind !== 'symbol-instance' || element.symbolId !== symbolId) return cloneDisplayDesign(element)
    const next = cloneDisplayDesign(element)
    if (next.state.kind === 'literal' && next.state.variantId === variantId) next.state.variantId = replacementVariantId
    if (next.state.kind === 'choice-binding') {
      for (const choiceId of Object.keys(next.state.variantByChoiceId)) {
        if (next.state.variantByChoiceId[choiceId] === variantId) next.state.variantByChoiceId[choiceId] = replacementVariantId
      }
    }
    return next
  })
  return { ...cloneDisplayDesign(document), symbols, elements }
}

export type DeleteDisplaySymbolChoice = 'detach-instances' | 'delete-instances'

export function deleteUsedDisplaySymbol(
  document: DisplayDesignDocument,
  symbolId: string,
  choice: DeleteDisplaySymbolChoice,
  idFactory: DisplayDesignIdFactory,
): DisplayDesignDocument {
  let next = cloneDisplayDesign(document)
  const ids = next.elements.filter((element) => element.kind === 'symbol-instance' && element.symbolId === symbolId).map(({ id }) => id)
  if (choice === 'detach-instances') {
    for (const id of ids) next = detachDisplaySymbolInstance(next, id, idFactory)
  } else {
    const deleting = new Set(ids)
    next.elements = next.elements.filter(({ id }) => !deleting.has(id))
  }
  next.symbols = next.symbols.filter(({ id }) => id !== symbolId)
  return next
}
