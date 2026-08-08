import { describe, expect, it } from 'vitest'
import {
  convertDisplayBindingUsesToStatic,
  createDisplayBindingInDocument,
  deleteDisplayBindingAndConvertUses,
  listDisplayBindingUsages,
} from './display-design-bindings'
import { allocateDisplayLuaIdentifier, displayLuaIdentifierBase } from './display-design-lua-identifiers'
import {
  createDefaultDisplayPrimitive,
  createEmptyDisplayDesign,
  createSequentialDisplayDesignIdFactory,
  type DisplayDesignDocument,
} from './display-design-model'

describe('display design binding operations', () => {
  it('normalizes safe Lua identifiers and resolves keywords, dependencies, and collisions deterministically', () => {
    expect(displayLuaIdentifierBase('  Étape Level  ')).toBe('etape_level')
    expect(displayLuaIdentifierBase('42%')).toBe('value_42')
    expect(displayLuaIdentifierBase('local')).toBe('value_local')
    expect(displayLuaIdentifierBase('math')).toBe('value_math')
    expect(allocateDisplayLuaIdentifier('Level', ['level', 'level_2'])).toBe('level_3')
  })

  it('creates every binding kind with unique identifiers in stable document order', () => {
    const ids = createSequentialDisplayDesignIdFactory('binding-op')
    let document = createEmptyDisplayDesign()
    const created = (['number', 'boolean', 'text', 'choice'] as const).map((kind) => {
      const result = createDisplayBindingInDocument(document, kind, ids, 'State')
      document = result.document
      return result.binding
    })
    expect(created.map(({ luaName }) => luaName)).toEqual(['state', 'state_2', 'state_3', 'state_4'])
    expect(document.bindings.map(({ kind }) => kind)).toEqual(['number', 'boolean', 'text', 'choice'])
  })

  it('finds shared uses across scene primitives, symbol primitives, visibility, text, and instance state', () => {
    const ids = createSequentialDisplayDesignIdFactory('usage')
    const numberId = ids('binding')
    const booleanId = ids('binding')
    const textId = ids('binding')
    const choiceId = ids('binding')
    const line = createDefaultDisplayPrimitive('pixel-line', ids)
    line.x1 = { kind: 'number-binding', bindingId: numberId, from: { kind: 'literal', value: 0 }, to: { kind: 'literal', value: 10 }, quantize: 'integer' }
    line.shade = { kind: 'number-binding', bindingId: numberId, from: { kind: 'literal', value: 15 }, to: { kind: 'literal', value: 0 }, quantize: 'integer' }
    line.visible = { kind: 'boolean-binding', bindingId: booleanId, invert: true }
    const text = createDefaultDisplayPrimitive('standard-text', ids, 'primitive')
    text.text = { kind: 'text-binding', bindingId: textId }
    const variantId = ids('variant')
    const symbolId = ids('symbol')
    const document: DisplayDesignDocument = {
      ...createEmptyDisplayDesign(),
      bindings: [
        { kind: 'number', id: numberId, name: 'Level', luaName: 'level', previewValue: 0.25 },
        { kind: 'boolean', id: booleanId, name: 'Show', luaName: 'show', previewValue: false },
        { kind: 'text', id: textId, name: 'Label', luaName: 'label', previewValue: 'Bound' },
        { kind: 'choice', id: choiceId, name: 'State', luaName: 'state', choices: [{ id: 'choice', name: 'Default', luaValue: 'default' }], previewChoiceId: 'choice' },
      ],
      symbols: [{ id: symbolId, name: 'Symbol', luaName: 'draw_symbol', defaultVariantId: variantId, variants: [{ id: variantId, name: 'Default', luaValue: 'default', elements: [text] }] }],
      elements: [line, {
        kind: 'symbol-instance', id: ids('element'), name: 'Instance', symbolId,
        x: { kind: 'literal', value: 0 }, y: { kind: 'literal', value: 0 }, visible: { kind: 'visible' },
        state: { kind: 'choice-binding', bindingId: choiceId, variantByChoiceId: { choice: variantId } },
      }],
    }
    expect(listDisplayBindingUsages(document).map(({ bindingId, property }) => [bindingId, property])).toEqual([
      [numberId, 'shade'], [booleanId, 'visibility'], [numberId, 'x1'], [choiceId, 'state'], [textId, 'text'],
    ])
  })

  it('converts shared number, boolean, text, and choice uses to current static previews before deletion', () => {
    const ids = createSequentialDisplayDesignIdFactory('static')
    const numberId = ids('binding')
    const booleanId = ids('binding')
    const textId = ids('binding')
    const line = createDefaultDisplayPrimitive('smooth-line', ids)
    line.x1 = { kind: 'number-binding', bindingId: numberId, from: { kind: 'literal', value: 10 }, to: { kind: 'literal', value: -10 }, quantize: 'none' }
    line.shade = { kind: 'number-binding', bindingId: numberId, from: { kind: 'literal', value: 0 }, to: { kind: 'literal', value: 15 }, quantize: 'integer' }
    line.visible = { kind: 'boolean-binding', bindingId: booleanId, invert: true }
    const text = createDefaultDisplayPrimitive('tiny-text', ids)
    text.text = { kind: 'text-binding', bindingId: textId }
    let document: DisplayDesignDocument = {
      ...createEmptyDisplayDesign(),
      bindings: [
        { kind: 'number', id: numberId, name: 'Level', luaName: 'level', previewValue: 0.25 },
        { kind: 'boolean', id: booleanId, name: 'Hidden', luaName: 'hidden', previewValue: false },
        { kind: 'text', id: textId, name: 'Label', luaName: 'label', previewValue: 'Preview' },
      ],
      elements: [line, text],
    }
    document = convertDisplayBindingUsesToStatic(document, numberId)
    const staticLine = document.elements[0]
    expect(staticLine).toMatchObject({ x1: { kind: 'literal', value: 5 }, shade: { kind: 'literal', value: 4 } })
    document = deleteDisplayBindingAndConvertUses(document, booleanId)
    document = deleteDisplayBindingAndConvertUses(document, textId)
    expect(document.bindings.map(({ id }) => id)).toEqual([numberId])
    expect(document.elements[0]).toMatchObject({ visible: { kind: 'visible' } })
    expect(document.elements[1]).toMatchObject({ text: { kind: 'literal', value: 'Preview' } })
  })

  it('discovers and converts number bindings on Bézier control points', () => {
    const ids = createSequentialDisplayDesignIdFactory('bezier-binding')
    const bindingId = ids('binding')
    const bezier = createDefaultDisplayPrimitive('bezier', ids)
    bezier.points[1]!.x = {
      kind: 'number-binding', bindingId,
      from: { kind: 'literal', value: 10 }, to: { kind: 'literal', value: 30 }, quantize: 'integer',
    }
    const document: DisplayDesignDocument = {
      ...createEmptyDisplayDesign(),
      bindings: [{ kind: 'number', id: bindingId, name: 'Control X', luaName: 'control_x', previewValue: 0.25 }],
      elements: [bezier],
    }

    expect(listDisplayBindingUsages(document)).toEqual([expect.objectContaining({ bindingId, property: 'points[1].x' })])
    const converted = convertDisplayBindingUsesToStatic(document, bindingId).elements[0]
    expect(converted?.kind === 'bezier' ? converted.points[1]?.x : undefined).toEqual({ kind: 'literal', value: 15 })
  })
})
