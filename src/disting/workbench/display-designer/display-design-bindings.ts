import {
  addDisplayDesignBinding,
  cloneDisplayDesign,
  createDefaultDisplayBinding,
  deleteDisplayDesignBinding,
  type DisplayDesignBinding,
  type DisplayDesignDocument,
  type DisplayDesignElement,
  type DisplayDesignIdFactory,
  type DisplayPrimitiveElement,
  type DisplayScalar,
} from './display-design-model'
import { allocateDisplayLuaIdentifier } from './display-design-lua-identifiers'
import {
  createDisplayBindingMap,
  createDisplayTokenMap,
  resolveDisplayScalar,
  resolveDisplayText,
} from './display-design-resolution'

export type DisplayBindingPropertyKind = 'number' | 'boolean' | 'text' | 'choice'

export interface DisplayBindingUsage {
  bindingId: string
  kind: DisplayBindingPropertyKind
  ownerName: string
  property: string
  elementId?: string
  symbolId?: string
  variantId?: string
  primitiveId?: string
}

function collectScalarUsage(
  scalar: DisplayScalar,
  usages: DisplayBindingUsage[],
  context: Omit<DisplayBindingUsage, 'bindingId' | 'kind' | 'property'>,
  property: string,
): void {
  if (scalar.kind === 'number-binding') usages.push({ ...context, bindingId: scalar.bindingId, kind: 'number', property })
}

function collectPrimitiveUsages(
  primitive: DisplayPrimitiveElement,
  usages: DisplayBindingUsage[],
  context: Omit<DisplayBindingUsage, 'bindingId' | 'kind' | 'property' | 'ownerName'>,
): void {
  const owner = { ...context, ownerName: primitive.name }
  collectScalarUsage(primitive.shade, usages, owner, 'shade')
  if (primitive.visible.kind === 'boolean-binding') usages.push({ ...owner, bindingId: primitive.visible.bindingId, kind: 'boolean', property: 'visibility' })
  if (primitive.kind === 'line' || primitive.kind === 'box') {
    for (const property of ['x1', 'y1', 'x2', 'y2'] as const) collectScalarUsage(primitive[property], usages, owner, property)
  } else if (primitive.kind === 'circle') {
    for (const property of ['x', 'y', 'radius'] as const) collectScalarUsage(primitive[property], usages, owner, property)
  } else {
    collectScalarUsage(primitive.x, usages, owner, 'x')
    collectScalarUsage(primitive.y, usages, owner, 'y')
    if (primitive.text.kind === 'text-binding') usages.push({ ...owner, bindingId: primitive.text.bindingId, kind: 'text', property: 'text' })
  }
}

export function listDisplayBindingUsages(document: DisplayDesignDocument): DisplayBindingUsage[] {
  const usages: DisplayBindingUsage[] = []
  for (const element of document.elements) {
    if (element.kind !== 'symbol-instance') {
      collectPrimitiveUsages(element, usages, { elementId: element.id })
      continue
    }
    const owner = { ownerName: element.name, elementId: element.id }
    collectScalarUsage(element.x, usages, owner, 'x')
    collectScalarUsage(element.y, usages, owner, 'y')
    if (element.visible.kind === 'boolean-binding') usages.push({ ...owner, bindingId: element.visible.bindingId, kind: 'boolean', property: 'visibility' })
    if (element.state.kind === 'choice-binding') usages.push({ ...owner, bindingId: element.state.bindingId, kind: 'choice', property: 'state' })
  }
  for (const symbol of document.symbols) {
    for (const variant of symbol.variants) {
      for (const primitive of variant.elements) collectPrimitiveUsages(primitive, usages, {
        symbolId: symbol.id,
        variantId: variant.id,
        primitiveId: primitive.id,
      })
    }
  }
  return usages
}

export function createDisplayBindingInDocument(
  document: DisplayDesignDocument,
  kind: DisplayDesignBinding['kind'],
  idFactory: DisplayDesignIdFactory,
  name?: string,
): { document: DisplayDesignDocument; binding: DisplayDesignBinding } {
  const binding = createDefaultDisplayBinding(kind, idFactory)
  if (name) binding.name = name
  binding.luaName = allocateDisplayLuaIdentifier(
    binding.name,
    [
      ...document.tokens.map(({ luaName }) => luaName),
      ...document.bindings.map(({ luaName }) => luaName),
      ...document.symbols.map(({ luaName }) => luaName),
    ],
    kind === 'choice' ? 'state' : 'value',
  )
  return { document: addDisplayDesignBinding(document, binding), binding }
}

function mapPrimitive(
  primitive: DisplayPrimitiveElement,
  bindingId: string,
  scalar: (value: DisplayScalar) => DisplayScalar,
  visibility: DisplayPrimitiveElement['visible'],
  text: string,
): DisplayPrimitiveElement {
  const common = {
    ...cloneDisplayDesign(primitive),
    shade: scalar(primitive.shade),
    visible: primitive.visible.kind === 'boolean-binding' && primitive.visible.bindingId === bindingId
      ? visibility
      : cloneDisplayDesign(primitive.visible),
  }
  if (primitive.kind === 'line' || primitive.kind === 'box') return {
    ...common,
    kind: primitive.kind,
    ...(primitive.kind === 'line' ? { smooth: primitive.smooth } : { fill: primitive.fill }),
    x1: scalar(primitive.x1), y1: scalar(primitive.y1), x2: scalar(primitive.x2), y2: scalar(primitive.y2),
  } as DisplayPrimitiveElement
  if (primitive.kind === 'circle') return {
    ...common, kind: 'circle', smooth: primitive.smooth,
    x: scalar(primitive.x), y: scalar(primitive.y), radius: scalar(primitive.radius),
  }
  return {
    ...common, kind: 'text', tiny: primitive.tiny,
    x: scalar(primitive.x), y: scalar(primitive.y), align: primitive.align,
    text: primitive.text.kind === 'text-binding' && primitive.text.bindingId === bindingId
      ? { kind: 'literal', value: text }
      : cloneDisplayDesign(primitive.text),
  }
}

export function convertDisplayBindingUsesToStatic(
  document: DisplayDesignDocument,
  bindingId: string,
): DisplayDesignDocument {
  const bindings = createDisplayBindingMap(document.bindings)
  const tokens = createDisplayTokenMap(document.tokens)
  const scalar = (value: DisplayScalar): DisplayScalar => value.kind === 'number-binding' && value.bindingId === bindingId
    ? { kind: 'literal', value: resolveDisplayScalar(value, bindings, tokens) }
    : cloneDisplayDesign(value)
  const binding = bindings.get(bindingId)
  const visibility = { kind: 'visible' } as const
  const text = binding?.kind === 'text' ? binding.previewValue : ''
  const elements = document.elements.flatMap((element): DisplayDesignElement[] => {
    if (element.kind !== 'symbol-instance') return [mapPrimitive(element, bindingId, scalar, visibility, text)]
    const next = cloneDisplayDesign(element)
    next.x = scalar(next.x)
    next.y = scalar(next.y)
    if (next.visible.kind === 'boolean-binding' && next.visible.bindingId === bindingId) next.visible = visibility
    if (next.state.kind === 'choice-binding' && next.state.bindingId === bindingId) {
      const choiceId = binding?.kind === 'choice' ? binding.previewChoiceId : ''
      next.state = { kind: 'literal', variantId: next.state.variantByChoiceId[choiceId] ?? '' }
    }
    return [next]
  })
  const symbols = document.symbols.map((symbol) => ({
    ...cloneDisplayDesign(symbol),
    variants: symbol.variants.map((variant) => ({
      ...cloneDisplayDesign(variant),
      elements: variant.elements.map((primitive) => mapPrimitive(primitive, bindingId, scalar, visibility, text)),
    })),
  }))
  return { ...cloneDisplayDesign(document), elements, symbols }
}

export function deleteDisplayBindingAndConvertUses(
  document: DisplayDesignDocument,
  bindingId: string,
): DisplayDesignDocument {
  return deleteDisplayDesignBinding(convertDisplayBindingUsesToStatic(document, bindingId), bindingId)
}

export function staticDisplayScalarValue(document: DisplayDesignDocument, scalar: DisplayScalar): number {
  return resolveDisplayScalar(scalar, createDisplayBindingMap(document.bindings), createDisplayTokenMap(document.tokens))
}

export function staticDisplayTextValue(document: DisplayDesignDocument, element: Extract<DisplayPrimitiveElement, { kind: 'text' }>): string {
  return resolveDisplayText(element.text, createDisplayBindingMap(document.bindings))
}
