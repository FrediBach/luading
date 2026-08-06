import { describe, expect, it } from 'vitest'
import {
  DISPLAY_DESIGN_LIMITS,
  createDefaultDisplayPrimitive,
  createEmptyDisplayDesign,
  createSequentialDisplayDesignIdFactory,
  type DisplayDesignDocumentV1,
  type DisplayDesignElement,
} from './display-design-model'
import { validateDisplayDesign } from './display-design-validation'

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

function validRichDocument(): DisplayDesignDocumentV1 {
  const ids = createSequentialDisplayDesignIdFactory('valid')
  const groupId = ids('group')
  const numberId = ids('binding')
  const booleanId = ids('binding')
  const textId = ids('binding')
  const choiceBindingId = ids('binding')
  const lowChoiceId = ids('choice')
  const highChoiceId = ids('choice')
  const symbolId = ids('symbol')
  const lowVariantId = ids('variant')
  const highVariantId = ids('variant')
  const lowPrimitive = createDefaultDisplayPrimitive('pixel-circle', ids, 'primitive')
  const highPrimitive = createDefaultDisplayPrimitive('smooth-circle', ids, 'primitive')
  const presets = [
    'pixel-line', 'smooth-line', 'outline-box', 'filled-box',
    'pixel-circle', 'smooth-circle', 'standard-text', 'tiny-text',
  ] as const
  const primitives: DisplayDesignElement[] = presets.map((preset) => ({ ...createDefaultDisplayPrimitive(preset, ids) }))
  primitives[0]!.groupId = groupId
  const line = primitives[0]
  if (line?.kind === 'line') {
    line.x1 = { kind: 'number-binding', bindingId: numberId, from: 0, to: 255, quantize: 'integer' }
    line.visible = { kind: 'boolean-binding', bindingId: booleanId, invert: false }
  }
  const text = primitives[6]
  if (text?.kind === 'text') text.text = { kind: 'text-binding', bindingId: textId }
  const instance: DisplayDesignElement = {
    kind: 'symbol-instance',
    id: ids('element'),
    name: 'Status instance',
    symbolId,
    x: { kind: 'literal', value: 40.5 },
    y: { kind: 'literal', value: 20.5 },
    visible: { kind: 'visible' },
    state: {
      kind: 'choice-binding',
      bindingId: choiceBindingId,
      variantByChoiceId: { [lowChoiceId]: lowVariantId, [highChoiceId]: highVariantId },
    },
  }
  return {
    ...createEmptyDisplayDesign('Designer fixture'),
    displayMode: 'full-screen',
    groups: [{ id: groupId, name: 'Artwork' }],
    bindings: [
      { kind: 'number', id: numberId, name: 'Level', luaName: 'level', previewValue: 0.5 },
      { kind: 'boolean', id: booleanId, name: 'Enabled', luaName: 'enabled', previewValue: true },
      { kind: 'text', id: textId, name: 'Label', luaName: 'label', previewValue: 'Grüße' },
      {
        kind: 'choice', id: choiceBindingId, name: 'State', luaName: 'state',
        choices: [
          { id: lowChoiceId, name: 'Low', luaValue: 'low' },
          { id: highChoiceId, name: 'High', luaValue: 'high' },
        ],
        previewChoiceId: highChoiceId,
      },
    ],
    symbols: [{
      id: symbolId,
      name: 'Status',
      luaName: 'draw_status',
      defaultVariantId: lowVariantId,
      variants: [
        { id: lowVariantId, name: 'Low', luaValue: 'low', elements: [lowPrimitive] },
        { id: highVariantId, name: 'High', luaValue: 'high', elements: [highPrimitive] },
      ],
    }],
    elements: [...primitives, instance],
  }
}

function errorRuleIds(value: unknown): string[] {
  return validateDisplayDesign(value).findings.filter(({ severity }) => severity === 'error').map(({ ruleId }) => ruleId)
}

describe('display design validation', () => {
  it('normalizes every valid primitive, binding, symbol, variant, and instance shape defensively', () => {
    const input = deepFreeze(validRichDocument())
    const result = validateDisplayDesign(input)

    expect(result.ok).toBe(true)
    expect(result.document).toEqual(input)
    expect(result.document).not.toBe(input)
    expect(result.document?.elements).not.toBe(input.elements)
    expect(result.document?.elements.map(({ kind }) => kind)).toEqual([
      'line', 'line', 'box', 'box', 'circle', 'circle', 'text', 'text', 'symbol-instance',
    ])
    expect(result.document?.bindings.map(({ kind }) => kind)).toEqual(['number', 'boolean', 'text', 'choice'])
    expect(result.findings.filter(({ severity }) => severity === 'warning').map(({ ruleId }) => ruleId)).toEqual([
      'approximate-smoothing', 'approximate-smoothing', 'approximate-smoothing',
    ])
  })

  it('refuses unknown roots and versions without throwing', () => {
    const invalidRoot = validateDisplayDesign(null)
    expect(invalidRoot.ok).toBe(false)
    expect(invalidRoot.document).toBeUndefined()
    const invalidKind = validateDisplayDesign({ ...createEmptyDisplayDesign(), kind: 'other' })
    expect(invalidKind.document).toBeUndefined()
    expect(invalidKind).toMatchObject({
      ok: false,
      findings: [{ ruleId: 'invalid-kind' }],
    })
    const invalidVersion = validateDisplayDesign({ ...createEmptyDisplayDesign(), version: 2 })
    expect(invalidVersion.document).toBeUndefined()
    expect(invalidVersion).toMatchObject({
      ok: false,
      findings: [{ ruleId: 'unsupported-version' }],
    })

    const circular: Record<string, unknown> = { ...createEmptyDisplayDesign() }
    circular.elements = [circular]
    expect(() => validateDisplayDesign(circular)).not.toThrow()
    expect(validateDisplayDesign(circular).ok).toBe(false)
  })

  it('reports unknown keys and invalid enum, ID, number, text, and Lua-identifier values', () => {
    const input = validRichDocument() as DisplayDesignDocumentV1 & Record<string, unknown>
    input.surprise = true
    input.displayMode = 'wide' as DisplayDesignDocumentV1['displayMode']
    const firstBinding = input.bindings[0]
    if (firstBinding?.kind === 'number') input.bindings[0] = { ...firstBinding, id: 'bad id', luaName: 'local', previewValue: Number.NaN }
    const first = input.elements[0]
    if (first?.kind === 'line') {
      first.smooth = false
      first.x1 = { kind: 'literal', value: 1.5 }
    }
    const text = input.elements.find((element) => element.kind === 'text')
    if (text?.kind === 'text') {
      text.align = 'middle' as typeof text.align
      text.text = { kind: 'literal', value: 'x'.repeat(DISPLAY_DESIGN_LIMITS.maximumTextCodePoints + 1) }
    }

    expect(errorRuleIds(input)).toEqual(expect.arrayContaining([
      'unknown-key', 'invalid-display-mode', 'invalid-id', 'invalid-lua-identifier',
      'invalid-number', 'integer-required', 'invalid-text-alignment', 'invalid-text',
    ]))
  })

  it('rejects identifiers that would shadow generated callback dependencies', () => {
    const input = validRichDocument()
    const numberBinding = input.bindings.find((binding) => binding.kind === 'number')
    const symbol = input.symbols[0]
    if (numberBinding?.kind === 'number') numberBinding.luaName = 'math'
    if (symbol) symbol.luaName = 'drawLine'
    expect(errorRuleIds(input).filter((ruleId) => ruleId === 'invalid-lua-identifier')).toHaveLength(2)
  })

  it('rejects duplicate identities, unsafe references, and mismatched binding kinds', () => {
    const input = validRichDocument()
    input.groups.push({ id: input.groups[0]!.id, name: 'Duplicate' })
    const numberBinding = input.bindings[0]!
    const booleanBinding = input.bindings[1]!
    input.bindings[1] = { ...booleanBinding, luaName: numberBinding.luaName }
    const line = input.elements[0]
    if (line?.kind === 'line') {
      line.groupId = 'missing-group'
      line.x1 = { kind: 'number-binding', bindingId: booleanBinding.id, from: 0, to: 20, quantize: 'integer' }
      line.visible = { kind: 'boolean-binding', bindingId: numberBinding.id, invert: false }
    }
    const text = input.elements.find((element) => element.kind === 'text')
    if (text?.kind === 'text') text.text = { kind: 'text-binding', bindingId: numberBinding.id }
    const instance = input.elements.at(-1)
    if (instance?.kind === 'symbol-instance') instance.symbolId = 'missing-symbol'

    expect(errorRuleIds(input)).toEqual(expect.arrayContaining([
      'duplicate-id', 'duplicate-lua-name', 'dangling-group', 'dangling-number-binding',
      'dangling-boolean-binding', 'dangling-text-binding', 'dangling-symbol',
    ]))
  })

  it('repairs a missing symbol default deterministically and rejects nested instances and duplicate state values', () => {
    const input = validRichDocument()
    const symbol = input.symbols[0]!
    symbol.defaultVariantId = 'missing'
    symbol.variants[1]!.luaValue = symbol.variants[0]!.luaValue
    symbol.variants[0]!.elements.push({
      kind: 'symbol-instance', id: 'nested', name: 'Nested', symbolId: symbol.id,
      x: { kind: 'literal', value: 0 }, y: { kind: 'literal', value: 0 },
      visible: { kind: 'visible' }, state: { kind: 'literal', variantId: symbol.variants[0]!.id },
    } as unknown as typeof symbol.variants[0]['elements'][number])

    const result = validateDisplayDesign(input)
    expect(result.ok).toBe(false)
    expect(result.document?.symbols[0]?.defaultVariantId).toBe(symbol.variants[0]!.id)
    expect(errorRuleIds(input)).toEqual(expect.arrayContaining([
      'invalid-default-variant', 'nested-symbol-instance', 'duplicate-variant-lua-value',
    ]))
  })

  it('requires complete choice maps with valid choice, variant, and preview identities', () => {
    const input = validRichDocument()
    const choiceBinding = input.bindings.find((binding) => binding.kind === 'choice')
    const instance = input.elements.at(-1)
    if (choiceBinding?.kind === 'choice') {
      choiceBinding.previewChoiceId = 'missing-choice'
      choiceBinding.choices[1]!.luaValue = choiceBinding.choices[0]!.luaValue
    }
    if (instance?.kind === 'symbol-instance' && instance.state.kind === 'choice-binding') {
      const firstChoiceId = choiceBinding?.kind === 'choice' ? choiceBinding.choices[0]!.id : ''
      instance.state.variantByChoiceId = { [firstChoiceId]: 'missing-variant', extra: input.symbols[0]!.defaultVariantId }
    }

    expect(errorRuleIds(input)).toEqual(expect.arrayContaining([
      'invalid-preview-choice', 'duplicate-choice-lua-value', 'incomplete-choice-map', 'unknown-choice-map-entry',
    ]))
  })

  it('rejects every version-one resource budget without truncating the normalized document', () => {
    const groupInput = createEmptyDisplayDesign()
    groupInput.groups = Array.from({ length: DISPLAY_DESIGN_LIMITS.maximumGroups + 1 }, (_, index) => ({ id: `group-${index}`, name: `Group ${index}` }))
    const bindingInput = createEmptyDisplayDesign()
    bindingInput.bindings = Array.from({ length: DISPLAY_DESIGN_LIMITS.maximumBindings + 1 }, (_, index) => ({ kind: 'number' as const, id: `binding-${index}`, name: `Binding ${index}`, luaName: `binding_${index}`, previewValue: 0 }))
    const symbolInput = createEmptyDisplayDesign()
    symbolInput.symbols = Array.from({ length: DISPLAY_DESIGN_LIMITS.maximumSymbols + 1 }, (_, index) => ({
      id: `symbol-${index}`, name: `Symbol ${index}`, luaName: `draw_symbol_${index}`,
      defaultVariantId: `variant-${index}`, variants: [{ id: `variant-${index}`, name: 'Default', luaValue: 'default', elements: [] }],
    }))
    const variantsInput = createEmptyDisplayDesign()
    variantsInput.symbols = [{
      id: 'symbol', name: 'Symbol', luaName: 'draw_symbol', defaultVariantId: 'variant-0',
      variants: Array.from({ length: DISPLAY_DESIGN_LIMITS.maximumVariantsPerSymbol + 1 }, (_, index) => ({ id: `variant-${index}`, name: `State ${index}`, luaValue: `state-${index}`, elements: [] })),
    }]
    const primitiveInput = createEmptyDisplayDesign()
    primitiveInput.elements = Array.from({ length: DISPLAY_DESIGN_LIMITS.maximumPrimitives + 1 }, (_, index) => ({
      ...createDefaultDisplayPrimitive('pixel-line', () => `element-${index}`),
    }))
    const instanceInput = validRichDocument()
    const template = instanceInput.elements.at(-1)!
    instanceInput.elements = Array.from({ length: DISPLAY_DESIGN_LIMITS.maximumInstances + 1 }, (_, index) => ({ ...structuredClone(template), id: `instance-${index}` }))

    expect(errorRuleIds(groupInput)).toContain('group-limit')
    expect(validateDisplayDesign(groupInput).document?.groups).toHaveLength(DISPLAY_DESIGN_LIMITS.maximumGroups + 1)
    expect(errorRuleIds(bindingInput)).toContain('binding-limit')
    expect(errorRuleIds(symbolInput)).toContain('symbol-limit')
    expect(errorRuleIds(variantsInput)).toContain('variant-limit')
    expect(errorRuleIds(primitiveInput)).toContain('primitive-limit')
    expect(errorRuleIds(instanceInput)).toContain('instance-limit')
  })
})
