import { describe, expect, it } from 'vitest'
import {
  DISPLAY_DESIGN_LIMITS,
  createDefaultDisplayPrimitive,
  createEmptyDisplayDesign,
  createSequentialDisplayDesignIdFactory,
  type DisplayDesignDocument,
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

function validRichDocument(): DisplayDesignDocument {
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
    'pixel-line', 'smooth-line', 'animated-line', 'outline-box', 'filled-box',
    'pixel-circle', 'smooth-circle', 'polygon', 'bezier', 'standard-text', 'tiny-text',
  ] as const
  const primitives: DisplayDesignElement[] = presets.map((preset) => ({ ...createDefaultDisplayPrimitive(preset, ids), screenId: 'display-screen-1' }))
  primitives[0]!.groupId = groupId
  const line = primitives[0]
  if (line?.kind === 'line') {
    line.x1 = { kind: 'number-binding', bindingId: numberId, from: { kind: 'literal', value: 0 }, to: { kind: 'literal', value: 255 }, quantize: 'integer' }
    line.visible = { kind: 'boolean-binding', bindingId: booleanId, invert: false }
  }
  const text = primitives[9]
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
    screenId: 'display-screen-1',
  }
  return {
    ...createEmptyDisplayDesign('Designer fixture'),
    displayMode: 'full-screen',
    groups: [{ id: groupId, name: 'Artwork', screenId: 'display-screen-1' }],
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
      'line', 'line', 'animated-line', 'box', 'box', 'circle', 'circle', 'polygon', 'bezier', 'text', 'text', 'symbol-instance',
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
    const invalidVersion = validateDisplayDesign({ ...createEmptyDisplayDesign(), version: 10 })
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

  it('validates screen ownership and the active screen reference', () => {
    const ids = createSequentialDisplayDesignIdFactory('screen-validation')
    const line = { ...createDefaultDisplayPrimitive('pixel-line', ids), screenId: 'missing-screen' }
    const invalid = validateDisplayDesign({
      ...createEmptyDisplayDesign(),
      activeScreenId: 'missing-screen',
      elements: [line],
    })
    expect(invalid.findings.map(({ ruleId }) => ruleId)).toEqual(expect.arrayContaining(['invalid-active-screen', 'dangling-screen']))

    const empty = validateDisplayDesign({ ...createEmptyDisplayDesign(), screens: [] })
    expect(empty.findings.map(({ ruleId }) => ruleId)).toContain('empty-screens')
  })

  it('validates pixel-box dimensions and every stored shade', () => {
    const ids = createSequentialDisplayDesignIdFactory('pixel-validation')
    const pixelBox = createDefaultDisplayPrimitive('pixel-box', ids)
    pixelBox.width = 2
    pixelBox.height = 2
    pixelBox.frames[0]!.shades = [0, 5, 10, 15]
    expect(validateDisplayDesign({ ...createEmptyDisplayDesign(), elements: [pixelBox] }).ok).toBe(true)

    const mismatch = validateDisplayDesign({ ...createEmptyDisplayDesign(), elements: [{ ...pixelBox, frames: [{ shades: [0, 1], duration: 1 }] }] })
    expect(mismatch.findings.map(({ ruleId }) => ruleId)).toContain('pixel-box-size-mismatch')
    const invalidShade = validateDisplayDesign({ ...createEmptyDisplayDesign(), elements: [{ ...pixelBox, frames: [{ shades: [0, 1, 2, 16], duration: 1 }] }] })
    expect(invalidShade.findings.map(({ ruleId }) => ruleId)).toContain('invalid-pixel-shade')

    const version3 = { ...createEmptyDisplayDesign(), version: 3, elements: [pixelBox] }
    expect(validateDisplayDesign(version3).findings.map(({ ruleId }) => ruleId)).toContain('unsupported-element-version')
  })

  it('validates pixel-box animation rates, frame counts, and durations', () => {
    const ids = createSequentialDisplayDesignIdFactory('pixel-animation-validation')
    const pixelBox = createDefaultDisplayPrimitive('pixel-box', ids)
    const animated = {
      ...pixelBox,
      frameRate: 15 as const,
      frames: [pixelBox.frames[0]!, { ...structuredClone(pixelBox.frames[0]!), duration: 3 }],
    }
    expect(validateDisplayDesign({ ...createEmptyDisplayDesign(), elements: [animated] }).ok).toBe(true)

    const badRate = validateDisplayDesign({ ...createEmptyDisplayDesign(), elements: [{ ...animated, frameRate: 7 }] })
    expect(badRate.findings.map(({ ruleId }) => ruleId)).toContain('invalid-pixel-box-frame-rate')
    const oneAnimatedFrame = validateDisplayDesign({ ...createEmptyDisplayDesign(), elements: [{ ...animated, frames: [animated.frames[0]!] }] })
    expect(oneAnimatedFrame.findings.map(({ ruleId }) => ruleId)).toContain('animated-pixel-box-frame-count')
    const badDuration = validateDisplayDesign({ ...createEmptyDisplayDesign(), elements: [{ ...animated, frames: [{ ...animated.frames[0]!, duration: 0 }, animated.frames[1]!] }] })
    expect(badDuration.findings.map(({ ruleId }) => ruleId)).toContain('invalid-number')
  })

  it('validates animated-line direction, speed, shades, alignment, and version', () => {
    const ids = createSequentialDisplayDesignIdFactory('animated-line-validation')
    const line = createDefaultDisplayPrimitive('animated-line', ids)
    expect(validateDisplayDesign({ ...createEmptyDisplayDesign(), elements: [line] }).ok).toBe(true)

    expect(errorRuleIds({ ...createEmptyDisplayDesign(), elements: [{ ...line, direction: 'diagonal' }] })).toContain('invalid-animated-line-direction')
    expect(errorRuleIds({ ...createEmptyDisplayDesign(), elements: [{ ...line, speed: 7 }] })).toContain('invalid-animated-line-speed')
    expect(errorRuleIds({ ...createEmptyDisplayDesign(), elements: [{ ...line, secondaryShade: { kind: 'literal', value: 16 } }] })).toContain('invalid-number')
    expect(errorRuleIds({ ...createEmptyDisplayDesign(), elements: [{ ...line, y2: { kind: 'literal', value: 17 } }] })).toContain('animated-line-axis-alignment')
    expect(errorRuleIds({ ...createEmptyDisplayDesign(), version: 8, elements: [line] })).toContain('unsupported-element-version')
  })

  it('validates polygon detail and keeps it exclusive to version 5', () => {
    const ids = createSequentialDisplayDesignIdFactory('polygon-validation')
    const polygon = createDefaultDisplayPrimitive('polygon', ids)
    expect(validateDisplayDesign({ ...createEmptyDisplayDesign(), elements: [polygon] }).ok).toBe(true)

    for (const sides of [2, 3.5, DISPLAY_DESIGN_LIMITS.maximumPolygonSides + 1]) {
      const result = validateDisplayDesign({ ...createEmptyDisplayDesign(), elements: [{ ...polygon, sides }] })
      expect(result.ok).toBe(false)
    }
    const version4 = { ...createEmptyDisplayDesign(), version: 4, elements: [polygon] }
    expect(validateDisplayDesign(version4).findings.map(({ ruleId }) => ruleId)).toContain('unsupported-element-version')
  })

  it('validates multi-point Bézier detail and keeps it exclusive to version 6', () => {
    const ids = createSequentialDisplayDesignIdFactory('bezier-validation')
    const bezier = createDefaultDisplayPrimitive('bezier', ids)
    expect(validateDisplayDesign({ ...createEmptyDisplayDesign(), elements: [bezier] }).ok).toBe(true)

    for (const candidate of [
      { ...bezier, points: bezier.points.slice(0, 1) },
      { ...bezier, segments: 0 },
      { ...bezier, segments: 2.5 },
      { ...bezier, segments: DISPLAY_DESIGN_LIMITS.maximumBezierSegments + 1 },
    ]) expect(validateDisplayDesign({ ...createEmptyDisplayDesign(), elements: [candidate] }).ok).toBe(false)

    const version5 = { ...createEmptyDisplayDesign(), version: 5, elements: [bezier] }
    expect(validateDisplayDesign(version5).findings.map(({ ruleId }) => ruleId)).toContain('unsupported-element-version')
  })

  it('migrates strict version-1 documents and validates version-2 layout grids', () => {
    const current = createEmptyDisplayDesign('Legacy')
    const legacy = structuredClone(current) as unknown as Record<string, unknown>
    delete legacy.screens
    delete legacy.activeScreenId
    delete legacy.layoutGrid
    delete legacy.tokens
    legacy.version = 1
    const migrated = validateDisplayDesign(legacy)

    expect(migrated.ok).toBe(true)
    expect(migrated.document).toEqual(current)

    const valid = validateDisplayDesign({
      ...current,
      layoutGrid: { kind: 'uniform', size: 64, color: '#12abef', opacity: 100 },
    })
    expect(valid.ok).toBe(true)
    expect(valid.document?.layoutGrid).toEqual({ kind: 'uniform', size: 64, color: '#12abef', opacity: 100 })

    for (const layoutGrid of [
      undefined,
      { kind: 'columns', size: 8, color: '#ff0000', opacity: 10 },
      { kind: 'uniform', size: 0, color: '#ff0000', opacity: 10 },
      { kind: 'uniform', size: 8.5, color: '#ff0000', opacity: 10 },
      { kind: 'uniform', size: 8, color: '#FF0000', opacity: 10 },
      { kind: 'uniform', size: 8, color: '#ff0000', opacity: 0 },
      { kind: 'uniform', size: 8, color: '#ff0000', opacity: 10.5 },
    ]) {
      expect(validateDisplayDesign({ ...current, layoutGrid }).ok).toBe(false)
    }
    expect(validateDisplayDesign({ ...legacy, layoutGrid: null }).findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'unknown-key' }),
    ]))
  })

  it('reports unknown keys and invalid enum, ID, number, text, and Lua-identifier values', () => {
    const input = validRichDocument() as DisplayDesignDocument & Record<string, unknown>
    input.surprise = true
    input.displayMode = 'wide' as DisplayDesignDocument['displayMode']
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

  it('strictly validates token definitions, ASTs, references, shared Lua names, and resolved domains', () => {
    const ids = createSequentialDisplayDesignIdFactory('token-validation')
    const line = createDefaultDisplayPrimitive('pixel-line', ids)
    const token = { id: ids('token'), name: 'Width', luaName: 'width', value: 0 }
    line.x1 = { kind: 'token-expression', expression: {
      kind: 'binary', operator: 'divide', left: { kind: 'number', value: 10 }, right: { kind: 'token', tokenId: token.id },
    } }
    const document = {
      ...createEmptyDisplayDesign(),
      tokens: [token],
      bindings: [{ kind: 'number' as const, id: ids('binding'), name: 'Width binding', luaName: 'width', previewValue: 0.5 }],
      elements: [line],
    }
    expect(validateDisplayDesign(document).findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'duplicate-lua-name' }),
      expect.objectContaining({ ruleId: 'invalid-token-result' }),
    ]))

    const dangling = structuredClone(document)
    dangling.bindings = []
    if (dangling.elements[0]?.kind === 'line') dangling.elements[0].x1 = { kind: 'token-expression', expression: { kind: 'token', tokenId: 'missing' } }
    expect(validateDisplayDesign(dangling).findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'dangling-token', focus: expect.objectContaining({ tokenId: 'missing' }) }),
    ]))

    const malformed = structuredClone(document) as unknown as Record<string, unknown>
    const elements = malformed.elements as Array<Record<string, unknown>>
    elements[0]!.x1 = { kind: 'token-expression', expression: { kind: 'binary', operator: 'power', left: { kind: 'number', value: 2 }, right: { kind: 'number', value: 3 }, extra: true } }
    expect(validateDisplayDesign(malformed).findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'unknown-key' }),
      expect.objectContaining({ ruleId: 'invalid-expression-operator' }),
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
      line.x1 = { kind: 'number-binding', bindingId: booleanBinding.id, from: { kind: 'literal', value: 0 }, to: { kind: 'literal', value: 20 }, quantize: 'integer' }
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
