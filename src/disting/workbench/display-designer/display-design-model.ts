export const DISPLAY_DESIGN_KIND = 'luading-display-design' as const
export const DISPLAY_DESIGN_VERSION_V1 = 1 as const
export const DISPLAY_DESIGN_VERSION_V2 = 2 as const
export const DISPLAY_DESIGN_VERSION_V3 = 3 as const
export const DISPLAY_DESIGN_VERSION_V4 = 4 as const
export const DISPLAY_DESIGN_VERSION_V5 = 5 as const
export const DISPLAY_DESIGN_VERSION = 6 as const

export const DEFAULT_DISPLAY_DESIGN_LAYOUT_GRID = {
  kind: 'uniform',
  size: 8,
  color: '#ff0000',
  opacity: 10,
} as const

export const DISPLAY_DESIGN_LIMITS = {
  maximumPrimitives: 512,
  maximumInstances: 128,
  maximumSymbols: 64,
  maximumVariantsPerSymbol: 16,
  maximumGroups: 64,
  maximumBindings: 64,
  maximumTokens: 64,
  maximumExpressionNodes: 64,
  maximumExpressionDepth: 16,
  maximumFormulaCodePoints: 256,
  maximumTextCodePoints: 512,
  maximumPixelBoxPixels: 256 * 64,
  maximumNameCodePoints: 80,
  minimumCoordinate: -4096,
  maximumCoordinate: 4096,
  maximumRadius: 4096,
  minimumPolygonSides: 3,
  maximumPolygonSides: 256,
  minimumBezierPoints: 2,
  maximumBezierPoints: 16,
  minimumBezierSegments: 1,
  maximumBezierSegments: 256,
  maximumJsonBytes: 1024 * 1024,
  maximumHistoryTransactions: 100,
  minimumLayoutGridSize: 1,
  maximumLayoutGridSize: 64,
  minimumLayoutGridOpacity: 1,
  maximumLayoutGridOpacity: 100,
} as const

export type DisplayMode = 'parameter-line' | 'full-screen'
export type DisplayTextAlignment = 'left' | 'centre' | 'right'
export type DisplayScalarQuantization = 'none' | 'integer'

export interface DisplayLiteralScalar {
  kind: 'literal'
  value: number
}

export type DisplayTokenExpression =
  | { kind: 'number'; value: number }
  | { kind: 'token'; tokenId: string }
  | { kind: 'negate'; operand: DisplayTokenExpression }
  | {
      kind: 'binary'
      operator: 'add' | 'subtract' | 'multiply' | 'divide'
      left: DisplayTokenExpression
      right: DisplayTokenExpression
    }

export interface DisplayTokenExpressionScalar {
  kind: 'token-expression'
  expression: DisplayTokenExpression
}

export type DisplayStaticScalar = DisplayLiteralScalar | DisplayTokenExpressionScalar

export interface DisplayNumberBindingScalar {
  kind: 'number-binding'
  bindingId: string
  from: DisplayStaticScalar
  to: DisplayStaticScalar
  quantize: DisplayScalarQuantization
}

export type DisplayScalar = DisplayStaticScalar | DisplayNumberBindingScalar

export type DisplayVisibility =
  | { kind: 'visible' }
  | { kind: 'boolean-binding'; bindingId: string; invert: boolean }

export type DisplayText =
  | { kind: 'literal'; value: string }
  | { kind: 'text-binding'; bindingId: string }

export interface DisplayPrimitiveBase {
  id: string
  name: string
  shade: DisplayScalar
  visible: DisplayVisibility
}

export interface DisplayLineElement extends DisplayPrimitiveBase {
  kind: 'line'
  smooth: boolean
  x1: DisplayScalar
  y1: DisplayScalar
  x2: DisplayScalar
  y2: DisplayScalar
}

export interface DisplayBoxElement extends DisplayPrimitiveBase {
  kind: 'box'
  fill: boolean
  x1: DisplayScalar
  y1: DisplayScalar
  x2: DisplayScalar
  y2: DisplayScalar
}

export interface DisplayCircleElement extends DisplayPrimitiveBase {
  kind: 'circle'
  smooth: boolean
  x: DisplayScalar
  y: DisplayScalar
  radius: DisplayScalar
}

export interface DisplayPolygonElement extends DisplayPrimitiveBase {
  kind: 'polygon'
  x: DisplayScalar
  y: DisplayScalar
  radius: DisplayScalar
  sides: number
}

export interface DisplayBezierPoint {
  x: DisplayScalar
  y: DisplayScalar
}

export interface DisplayBezierElement extends DisplayPrimitiveBase {
  kind: 'bezier'
  points: DisplayBezierPoint[]
  segments: number
}

export interface DisplayTextElement extends DisplayPrimitiveBase {
  kind: 'text'
  tiny: boolean
  x: DisplayScalar
  y: DisplayScalar
  text: DisplayText
  align: DisplayTextAlignment
}

export interface DisplayPixelBoxElement {
  kind: 'pixel-box'
  id: string
  name: string
  visible: DisplayVisibility
  x: DisplayScalar
  y: DisplayScalar
  width: number
  height: number
  shades: number[]
}

export type DisplayPrimitiveElement =
  | DisplayLineElement
  | DisplayBoxElement
  | DisplayCircleElement
  | DisplayPolygonElement
  | DisplayBezierElement
  | DisplayTextElement
  | DisplayPixelBoxElement

export type DisplaySymbolState =
  | { kind: 'literal'; variantId: string }
  | {
      kind: 'choice-binding'
      bindingId: string
      variantByChoiceId: Record<string, string>
    }

export interface DisplaySymbolInstance {
  kind: 'symbol-instance'
  id: string
  name: string
  groupId?: string
  symbolId: string
  x: DisplayScalar
  y: DisplayScalar
  visible: DisplayVisibility
  state: DisplaySymbolState
}

export type DisplayDesignElement =
  | (DisplayPrimitiveElement & { groupId?: string })
  | DisplaySymbolInstance

export interface DisplayDesignGroup {
  id: string
  name: string
}

export interface DisplayDesignToken {
  id: string
  name: string
  luaName: string
  value: number
}

export interface DisplaySymbolVariant {
  id: string
  name: string
  luaValue: string
  elements: DisplayPrimitiveElement[]
}

export interface DisplayDesignSymbol {
  id: string
  name: string
  luaName: string
  defaultVariantId: string
  variants: DisplaySymbolVariant[]
}

export interface DisplayNumberBinding {
  kind: 'number'
  id: string
  name: string
  luaName: string
  previewValue: number
}

export interface DisplayBooleanBinding {
  kind: 'boolean'
  id: string
  name: string
  luaName: string
  previewValue: boolean
}

export interface DisplayTextBinding {
  kind: 'text'
  id: string
  name: string
  luaName: string
  previewValue: string
}

export interface DisplayChoiceBindingChoice {
  id: string
  name: string
  luaValue: string
}

export interface DisplayChoiceBinding {
  kind: 'choice'
  id: string
  name: string
  luaName: string
  choices: DisplayChoiceBindingChoice[]
  previewChoiceId: string
}

export type DisplayDesignBinding =
  | DisplayNumberBinding
  | DisplayBooleanBinding
  | DisplayTextBinding
  | DisplayChoiceBinding

export interface DisplayDesignLayoutGrid {
  kind: 'uniform'
  size: number
  color: string
  opacity: number
}

interface DisplayDesignDocumentFields {
  kind: typeof DISPLAY_DESIGN_KIND
  name: string
  displayMode: DisplayMode
  elements: DisplayDesignElement[]
  groups: DisplayDesignGroup[]
  bindings: DisplayDesignBinding[]
  symbols: DisplayDesignSymbol[]
}

export interface DisplayDesignDocumentV1 extends DisplayDesignDocumentFields {
  version: typeof DISPLAY_DESIGN_VERSION_V1
}

export interface DisplayDesignDocumentV2 extends DisplayDesignDocumentFields {
  version: typeof DISPLAY_DESIGN_VERSION_V2
  layoutGrid: DisplayDesignLayoutGrid | null
}

export interface DisplayDesignDocumentV3 extends DisplayDesignDocumentFields {
  version: typeof DISPLAY_DESIGN_VERSION_V3
  tokens: DisplayDesignToken[]
  layoutGrid: DisplayDesignLayoutGrid | null
}

export interface DisplayDesignDocumentV4 extends DisplayDesignDocumentFields {
  version: typeof DISPLAY_DESIGN_VERSION_V4
  tokens: DisplayDesignToken[]
  layoutGrid: DisplayDesignLayoutGrid | null
}

export interface DisplayDesignDocumentV5 extends DisplayDesignDocumentFields {
  version: typeof DISPLAY_DESIGN_VERSION_V5
  tokens: DisplayDesignToken[]
  layoutGrid: DisplayDesignLayoutGrid | null
}

export interface DisplayDesignDocumentV6 extends DisplayDesignDocumentFields {
  version: typeof DISPLAY_DESIGN_VERSION
  tokens: DisplayDesignToken[]
  layoutGrid: DisplayDesignLayoutGrid | null
}

export type DisplayDesignDocument = DisplayDesignDocumentV6

export interface DisplayDesignSelection {
  elementIds: string[]
  groupIds: string[]
  symbolId?: string
  variantId?: string
  primitiveIds: string[]
}

export type DisplayDesignerFindingSeverity = 'error' | 'warning'

export interface DisplayDesignerFindingFocus {
  elementId?: string
  groupId?: string
  bindingId?: string
  tokenId?: string
  symbolId?: string
  variantId?: string
  primitiveId?: string
  property?: string
}

export interface DisplayDesignerFinding {
  ruleId: string
  severity: DisplayDesignerFindingSeverity
  message: string
  path: string
  focus?: DisplayDesignerFindingFocus
}

export type DisplayPrimitivePreset =
  | 'pixel-line'
  | 'smooth-line'
  | 'outline-box'
  | 'filled-box'
  | 'pixel-box'
  | 'pixel-circle'
  | 'smooth-circle'
  | 'polygon'
  | 'bezier'
  | 'standard-text'
  | 'tiny-text'

export type DisplayDesignIdScope =
  | 'element'
  | 'group'
  | 'binding'
  | 'token'
  | 'choice'
  | 'symbol'
  | 'variant'
  | 'primitive'

export type DisplayDesignIdFactory = (scope: DisplayDesignIdScope) => string

const literal = (value: number): DisplayLiteralScalar => ({ kind: 'literal', value })
const visible = (): DisplayVisibility => ({ kind: 'visible' })

export function createSequentialDisplayDesignIdFactory(prefix = 'display'): DisplayDesignIdFactory {
  let nextId = 1
  return (scope) => `${prefix}-${scope}-${nextId++}`
}

export function createCollisionSafeDisplayDesignIdFactory(
  document: DisplayDesignDocument,
  prefix = 'display',
): DisplayDesignIdFactory {
  const usedIds = new Set<string>([
    ...document.elements.map(({ id }) => id),
    ...document.groups.map(({ id }) => id),
    ...document.tokens.map(({ id }) => id),
    ...document.bindings.flatMap((binding) => [
      binding.id,
      ...(binding.kind === 'choice' ? binding.choices.map(({ id }) => id) : []),
    ]),
    ...document.symbols.flatMap((symbol) => [
      symbol.id,
      ...symbol.variants.flatMap((variant) => [variant.id, ...variant.elements.map(({ id }) => id)]),
    ]),
  ])
  const candidate = createSequentialDisplayDesignIdFactory(prefix)
  return (scope) => {
    let id = candidate(scope)
    while (usedIds.has(id)) id = candidate(scope)
    usedIds.add(id)
    return id
  }
}

export function createEmptyDisplayDesign(name = 'Untitled display'): DisplayDesignDocument {
  return {
    kind: DISPLAY_DESIGN_KIND,
    version: DISPLAY_DESIGN_VERSION,
    name,
    displayMode: 'parameter-line',
    elements: [],
    groups: [],
    tokens: [],
    bindings: [],
    symbols: [],
    layoutGrid: null,
  }
}

export function addDefaultDisplayDesignLayoutGrid(
  document: DisplayDesignDocument,
): DisplayDesignDocument {
  if (document.layoutGrid) return cloneDisplayDesign(document)
  return { ...cloneDisplayDesign(document), layoutGrid: cloneDisplayDesign(DEFAULT_DISPLAY_DESIGN_LAYOUT_GRID) }
}

export function updateDisplayDesignLayoutGrid(
  document: DisplayDesignDocument,
  update: (layoutGrid: DisplayDesignLayoutGrid) => DisplayDesignLayoutGrid,
): DisplayDesignDocument {
  if (!document.layoutGrid) return cloneDisplayDesign(document)
  return {
    ...cloneDisplayDesign(document),
    layoutGrid: cloneDisplayDesign(update(cloneDisplayDesign(document.layoutGrid))),
  }
}

export function removeDisplayDesignLayoutGrid(
  document: DisplayDesignDocument,
): DisplayDesignDocument {
  return document.layoutGrid ? { ...cloneDisplayDesign(document), layoutGrid: null } : cloneDisplayDesign(document)
}

export function createEmptyDisplayDesignSelection(): DisplayDesignSelection {
  return { elementIds: [], groupIds: [], primitiveIds: [] }
}

export function createDefaultDisplayPrimitive(
  preset: 'pixel-line' | 'smooth-line',
  idFactory: DisplayDesignIdFactory,
  scope?: 'element' | 'primitive',
): DisplayLineElement
export function createDefaultDisplayPrimitive(
  preset: 'outline-box' | 'filled-box',
  idFactory: DisplayDesignIdFactory,
  scope?: 'element' | 'primitive',
): DisplayBoxElement
export function createDefaultDisplayPrimitive(
  preset: 'pixel-box',
  idFactory: DisplayDesignIdFactory,
  scope?: 'element' | 'primitive',
): DisplayPixelBoxElement
export function createDefaultDisplayPrimitive(
  preset: 'pixel-circle' | 'smooth-circle',
  idFactory: DisplayDesignIdFactory,
  scope?: 'element' | 'primitive',
): DisplayCircleElement
export function createDefaultDisplayPrimitive(
  preset: 'polygon',
  idFactory: DisplayDesignIdFactory,
  scope?: 'element' | 'primitive',
): DisplayPolygonElement
export function createDefaultDisplayPrimitive(
  preset: 'bezier',
  idFactory: DisplayDesignIdFactory,
  scope?: 'element' | 'primitive',
): DisplayBezierElement
export function createDefaultDisplayPrimitive(
  preset: 'standard-text' | 'tiny-text',
  idFactory: DisplayDesignIdFactory,
  scope?: 'element' | 'primitive',
): DisplayTextElement
export function createDefaultDisplayPrimitive(
  preset: DisplayPrimitivePreset,
  idFactory: DisplayDesignIdFactory,
  scope?: 'element' | 'primitive',
): DisplayPrimitiveElement
export function createDefaultDisplayPrimitive(
  preset: DisplayPrimitivePreset,
  idFactory: DisplayDesignIdFactory,
  scope: 'element' | 'primitive' = 'element',
): DisplayPrimitiveElement {
  const id = idFactory(scope)
  const base = { id, shade: literal(15), visible: visible() }
  switch (preset) {
    case 'pixel-line':
      return { ...base, kind: 'line', name: 'Pixel line', smooth: false, x1: literal(8), y1: literal(16), x2: literal(32), y2: literal(16) }
    case 'smooth-line':
      return { ...base, kind: 'line', name: 'Smooth line', smooth: true, x1: literal(8.5), y1: literal(16.5), x2: literal(32.5), y2: literal(16.5) }
    case 'outline-box':
      return { ...base, kind: 'box', name: 'Outline box', fill: false, x1: literal(8), y1: literal(16), x2: literal(32), y2: literal(24) }
    case 'filled-box':
      return { ...base, kind: 'box', name: 'Filled box', fill: true, x1: literal(8), y1: literal(16), x2: literal(32), y2: literal(24) }
    case 'pixel-box':
      return { id, kind: 'pixel-box', name: 'Pixel box', visible: visible(), x: literal(8), y: literal(16), width: 8, height: 8, shades: Array(64).fill(15) }
    case 'pixel-circle':
      return { ...base, kind: 'circle', name: 'Pixel circle', smooth: false, x: literal(20), y: literal(20), radius: literal(6) }
    case 'smooth-circle':
      return { ...base, kind: 'circle', name: 'Smooth circle', smooth: true, x: literal(20.5), y: literal(20.5), radius: literal(6.5) }
    case 'polygon':
      return { ...base, kind: 'polygon', name: 'Polygon', x: literal(20), y: literal(20), radius: literal(8), sides: 6 }
    case 'bezier':
      return {
        ...base,
        kind: 'bezier',
        name: 'Bézier curve',
        points: [
          { x: literal(8), y: literal(24) },
          { x: literal(20), y: literal(12) },
          { x: literal(36), y: literal(36) },
          { x: literal(48), y: literal(24) },
        ],
        segments: 24,
      }
    case 'standard-text':
      return { ...base, kind: 'text', name: 'Standard text', tiny: false, x: literal(8), y: literal(20), text: { kind: 'literal', value: 'Text' }, align: 'left' }
    case 'tiny-text':
      return { ...base, kind: 'text', name: 'Tiny text', tiny: true, x: literal(8), y: literal(20), text: { kind: 'literal', value: 'Text' }, align: 'left' }
  }
}

export function createDefaultDisplayGroup(idFactory: DisplayDesignIdFactory, name = 'Group'): DisplayDesignGroup {
  return { id: idFactory('group'), name }
}

export function createDefaultDisplayBinding(
  kind: DisplayDesignBinding['kind'],
  idFactory: DisplayDesignIdFactory,
): DisplayDesignBinding {
  const id = idFactory('binding')
  if (kind === 'number') return { kind, id, name: 'Value', luaName: 'value', previewValue: 0.5 }
  if (kind === 'boolean') return { kind, id, name: 'Visible', luaName: 'visible', previewValue: true }
  if (kind === 'text') return { kind, id, name: 'Label', luaName: 'label', previewValue: 'Text' }
  const choiceId = idFactory('choice')
  return {
    kind,
    id,
    name: 'State',
    luaName: 'state',
    choices: [{ id: choiceId, name: 'Default', luaValue: 'default' }],
    previewChoiceId: choiceId,
  }
}

export function cloneDisplayDesign<T>(value: T): T {
  return structuredClone(value)
}

function copiedName(name: string): string {
  const match = /^(.*?)(?: copy(?: (\d+))?)?$/.exec(name)
  const base = match?.[1] || name
  const copyNumber = match?.[2] ? Number(match[2]) + 1 : match?.[0] !== base ? 2 : 1
  return `${base} copy${copyNumber === 1 ? '' : ` ${copyNumber}`}`
}

export function addDisplayDesignElement(
  document: DisplayDesignDocument,
  element: DisplayDesignElement,
  index = document.elements.length,
): DisplayDesignDocument {
  const elements = cloneDisplayDesign(document.elements)
  elements.splice(Math.max(0, Math.min(index, elements.length)), 0, cloneDisplayDesign(element))
  return { ...cloneDisplayDesign(document), elements }
}

export function updateDisplayDesignElement(
  document: DisplayDesignDocument,
  elementId: string,
  update: (element: DisplayDesignElement) => DisplayDesignElement,
): DisplayDesignDocument {
  let changed = false
  const elements = document.elements.map((element) => {
    if (element.id !== elementId) return cloneDisplayDesign(element)
    changed = true
    return cloneDisplayDesign(update(cloneDisplayDesign(element)))
  })
  return changed ? { ...cloneDisplayDesign(document), elements } : cloneDisplayDesign(document)
}

export function deleteDisplayDesignElements(
  document: DisplayDesignDocument,
  elementIds: Iterable<string>,
): DisplayDesignDocument {
  const deleted = new Set(elementIds)
  return { ...cloneDisplayDesign(document), elements: document.elements.filter(({ id }) => !deleted.has(id)).map(cloneDisplayDesign) }
}

export function duplicateDisplayDesignElements(
  document: DisplayDesignDocument,
  elementIds: Iterable<string>,
  idFactory: DisplayDesignIdFactory,
): { document: DisplayDesignDocument; duplicatedIds: string[] } {
  const selected = new Set(elementIds)
  const duplicatedIds: string[] = []
  const elements = document.elements.flatMap((element) => {
    const original = cloneDisplayDesign(element)
    if (!selected.has(element.id)) return [original]
    const duplicate = cloneDisplayDesign(element)
    duplicate.id = idFactory('element')
    duplicate.name = copiedName(element.name)
    duplicatedIds.push(duplicate.id)
    return [original, duplicate]
  })
  return { document: { ...cloneDisplayDesign(document), elements }, duplicatedIds }
}

export function reorderDisplayDesignElement(
  document: DisplayDesignDocument,
  fromIndex: number,
  toIndex: number,
): DisplayDesignDocument {
  const elements = cloneDisplayDesign(document.elements)
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= elements.length) return cloneDisplayDesign(document)
  const destination = Math.max(0, Math.min(Math.trunc(toIndex), elements.length - 1))
  const [element] = elements.splice(fromIndex, 1)
  if (!element) return cloneDisplayDesign(document)
  elements.splice(destination, 0, element)
  return { ...cloneDisplayDesign(document), elements }
}

export function layerIndexToElementIndex(layerIndex: number, elementCount: number): number {
  return elementCount - 1 - layerIndex
}

export function reorderDisplayDesignLayer(
  document: DisplayDesignDocument,
  fromLayerIndex: number,
  toLayerIndex: number,
): DisplayDesignDocument {
  return reorderDisplayDesignElement(
    document,
    layerIndexToElementIndex(fromLayerIndex, document.elements.length),
    layerIndexToElementIndex(toLayerIndex, document.elements.length),
  )
}

export function addDisplayDesignGroup(
  document: DisplayDesignDocument,
  group: DisplayDesignGroup,
): DisplayDesignDocument {
  return { ...cloneDisplayDesign(document), groups: [...cloneDisplayDesign(document.groups), cloneDisplayDesign(group)] }
}

export function updateDisplayDesignGroup(
  document: DisplayDesignDocument,
  groupId: string,
  update: (group: DisplayDesignGroup) => DisplayDesignGroup,
): DisplayDesignDocument {
  return {
    ...cloneDisplayDesign(document),
    groups: document.groups.map((group) => group.id === groupId ? cloneDisplayDesign(update(cloneDisplayDesign(group))) : cloneDisplayDesign(group)),
  }
}

export function assignDisplayDesignGroup(
  document: DisplayDesignDocument,
  elementIds: Iterable<string>,
  groupId?: string,
): DisplayDesignDocument {
  const selected = new Set(elementIds)
  return {
    ...cloneDisplayDesign(document),
    elements: document.elements.map((element) => {
      const next = cloneDisplayDesign(element)
      if (!selected.has(element.id)) return next
      if (groupId === undefined) delete next.groupId
      else next.groupId = groupId
      return next
    }),
  }
}

export type DeleteDisplayDesignGroupChoice = 'ungroup' | 'delete-elements'

export function deleteDisplayDesignGroup(
  document: DisplayDesignDocument,
  groupId: string,
  choice: DeleteDisplayDesignGroupChoice,
): DisplayDesignDocument {
  const groups = document.groups.filter(({ id }) => id !== groupId).map(cloneDisplayDesign)
  const elements = document.elements.flatMap((element) => {
    if (element.groupId !== groupId) return [cloneDisplayDesign(element)]
    if (choice === 'delete-elements') return []
    const next = cloneDisplayDesign(element)
    delete next.groupId
    return [next]
  })
  return { ...cloneDisplayDesign(document), groups, elements }
}

export function duplicateDisplayDesignGroup(
  document: DisplayDesignDocument,
  groupId: string,
  idFactory: DisplayDesignIdFactory,
): { document: DisplayDesignDocument; groupId?: string; duplicatedElementIds: string[] } {
  const sourceGroup = document.groups.find(({ id }) => id === groupId)
  if (!sourceGroup) return { document: cloneDisplayDesign(document), duplicatedElementIds: [] }
  const duplicateGroup = { ...cloneDisplayDesign(sourceGroup), id: idFactory('group'), name: copiedName(sourceGroup.name) }
  const duplicatedElementIds: string[] = []
  const elements = document.elements.flatMap((element) => {
    const original = cloneDisplayDesign(element)
    if (element.groupId !== groupId) return [original]
    const duplicate = cloneDisplayDesign(element)
    duplicate.id = idFactory('element')
    duplicate.name = copiedName(element.name)
    duplicate.groupId = duplicateGroup.id
    duplicatedElementIds.push(duplicate.id)
    return [original, duplicate]
  })
  return {
    document: {
      ...cloneDisplayDesign(document),
      groups: [...cloneDisplayDesign(document.groups), duplicateGroup],
      elements,
    },
    groupId: duplicateGroup.id,
    duplicatedElementIds,
  }
}

export function addDisplayDesignBinding(
  document: DisplayDesignDocument,
  binding: DisplayDesignBinding,
): DisplayDesignDocument {
  return { ...cloneDisplayDesign(document), bindings: [...cloneDisplayDesign(document.bindings), cloneDisplayDesign(binding)] }
}

export function updateDisplayDesignBinding(
  document: DisplayDesignDocument,
  bindingId: string,
  update: (binding: DisplayDesignBinding) => DisplayDesignBinding,
): DisplayDesignDocument {
  return {
    ...cloneDisplayDesign(document),
    bindings: document.bindings.map((binding) => binding.id === bindingId ? cloneDisplayDesign(update(cloneDisplayDesign(binding))) : cloneDisplayDesign(binding)),
  }
}

export function deleteDisplayDesignBinding(document: DisplayDesignDocument, bindingId: string): DisplayDesignDocument {
  return { ...cloneDisplayDesign(document), bindings: document.bindings.filter(({ id }) => id !== bindingId).map(cloneDisplayDesign) }
}

export function addDisplayDesignSymbol(
  document: DisplayDesignDocument,
  symbol: DisplayDesignSymbol,
): DisplayDesignDocument {
  return { ...cloneDisplayDesign(document), symbols: [...cloneDisplayDesign(document.symbols), cloneDisplayDesign(symbol)] }
}

export function updateDisplayDesignSymbol(
  document: DisplayDesignDocument,
  symbolId: string,
  update: (symbol: DisplayDesignSymbol) => DisplayDesignSymbol,
): DisplayDesignDocument {
  return {
    ...cloneDisplayDesign(document),
    symbols: document.symbols.map((symbol) => symbol.id === symbolId ? cloneDisplayDesign(update(cloneDisplayDesign(symbol))) : cloneDisplayDesign(symbol)),
  }
}

export function deleteDisplayDesignSymbol(document: DisplayDesignDocument, symbolId: string): DisplayDesignDocument {
  return { ...cloneDisplayDesign(document), symbols: document.symbols.filter(({ id }) => id !== symbolId).map(cloneDisplayDesign) }
}

function allocateCopiedLuaName(luaName: string, usedNames: Set<string>): string {
  let suffix = 1
  let candidate = `${luaName}_copy`
  while (usedNames.has(candidate)) candidate = `${luaName}_copy_${++suffix}`
  return candidate
}

export function duplicateDisplayDesignSymbol(
  document: DisplayDesignDocument,
  symbolId: string,
  idFactory: DisplayDesignIdFactory,
): { document: DisplayDesignDocument; symbolId?: string } {
  const source = document.symbols.find(({ id }) => id === symbolId)
  if (!source) return { document: cloneDisplayDesign(document) }
  const variantIds = new Map<string, string>()
  const variants = source.variants.map((variant) => {
    const id = idFactory('variant')
    variantIds.set(variant.id, id)
    return {
      ...cloneDisplayDesign(variant),
      id,
      elements: variant.elements.map((primitive) => ({
        ...cloneDisplayDesign(primitive),
        id: idFactory('primitive'),
      })),
    }
  })
  const duplicate: DisplayDesignSymbol = {
    ...cloneDisplayDesign(source),
    id: idFactory('symbol'),
    name: copiedName(source.name),
    luaName: allocateCopiedLuaName(source.luaName, new Set([
      ...document.tokens.map(({ luaName }) => luaName),
      ...document.bindings.map(({ luaName }) => luaName),
      ...document.symbols.map(({ luaName }) => luaName),
    ])),
    defaultVariantId: variantIds.get(source.defaultVariantId) ?? variants[0]?.id ?? '',
    variants,
  }
  return {
    document: { ...cloneDisplayDesign(document), symbols: [...cloneDisplayDesign(document.symbols), duplicate] },
    symbolId: duplicate.id,
  }
}

export function setDisplayDesignMode(document: DisplayDesignDocument, displayMode: DisplayMode): DisplayDesignDocument {
  return { ...cloneDisplayDesign(document), displayMode }
}

export function normalizeDisplayDesignSelection(
  document: DisplayDesignDocument,
  selection: DisplayDesignSelection,
): DisplayDesignSelection {
  const elementIds = new Set(document.elements.map(({ id }) => id))
  const groupIds = new Set(document.groups.map(({ id }) => id))
  const symbol = selection.symbolId ? document.symbols.find(({ id }) => id === selection.symbolId) : undefined
  const variant = symbol && selection.variantId ? symbol.variants.find(({ id }) => id === selection.variantId) : undefined
  const primitiveIds = new Set(variant?.elements.map(({ id }) => id) ?? [])
  return {
    elementIds: [...new Set(selection.elementIds)].filter((id) => elementIds.has(id)),
    groupIds: [...new Set(selection.groupIds)].filter((id) => groupIds.has(id)),
    ...(symbol ? { symbolId: symbol.id } : {}),
    ...(variant ? { variantId: variant.id } : {}),
    primitiveIds: [...new Set(selection.primitiveIds)].filter((id) => primitiveIds.has(id)),
  }
}

export type DisplayDesignSelectionMode = 'replace' | 'add' | 'toggle'

function updateSelectedIds(currentIds: string[], requestedIds: Iterable<string>, mode: DisplayDesignSelectionMode): string[] {
  const requested = [...new Set(requestedIds)]
  if (mode === 'replace') return requested
  const next = new Set(currentIds)
  for (const id of requested) {
    if (mode === 'toggle' && next.has(id)) next.delete(id)
    else next.add(id)
  }
  return [...next]
}

export function selectDisplayDesignElements(
  document: DisplayDesignDocument,
  selection: DisplayDesignSelection,
  elementIds: Iterable<string>,
  mode: DisplayDesignSelectionMode = 'replace',
): DisplayDesignSelection {
  return normalizeDisplayDesignSelection(document, {
    ...cloneDisplayDesign(selection),
    elementIds: updateSelectedIds(selection.elementIds, elementIds, mode),
    symbolId: undefined,
    variantId: undefined,
    primitiveIds: [],
  })
}

export function selectDisplayDesignGroups(
  document: DisplayDesignDocument,
  selection: DisplayDesignSelection,
  groupIds: Iterable<string>,
  mode: DisplayDesignSelectionMode = 'replace',
): DisplayDesignSelection {
  return normalizeDisplayDesignSelection(document, {
    ...cloneDisplayDesign(selection),
    groupIds: updateSelectedIds(selection.groupIds, groupIds, mode),
  })
}

export function selectDisplayDesignVariantPrimitives(
  document: DisplayDesignDocument,
  symbolId: string,
  variantId: string,
  primitiveIds: Iterable<string>,
  mode: DisplayDesignSelectionMode = 'replace',
  selection = createEmptyDisplayDesignSelection(),
): DisplayDesignSelection {
  const sameContext = selection.symbolId === symbolId && selection.variantId === variantId
  return normalizeDisplayDesignSelection(document, {
    elementIds: [],
    groupIds: [],
    symbolId,
    variantId,
    primitiveIds: updateSelectedIds(sameContext ? selection.primitiveIds : [], primitiveIds, mode),
  })
}
