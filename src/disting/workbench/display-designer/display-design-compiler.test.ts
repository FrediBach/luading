import { describe, expect, it } from 'vitest'
import type { DrawCommand } from '../../types'
import {
  createDefaultDisplayPrimitive,
  createEmptyDisplayDesign,
  createSequentialDisplayDesignIdFactory,
  type DisplayDesignBinding,
  type DisplayDesignDocumentV1,
  type DisplayPrimitiveElement,
} from './display-design-model'
import {
  compileDisplayDesign,
  compileDisplayPrimitive,
} from './display-design-compiler'
import { createDisplayBindingMap } from './display-design-resolution'
import { generateDisplayDesignLua } from './display-design-generator'

function staticPrimitiveDocument(): DisplayDesignDocumentV1 {
  const ids = createSequentialDisplayDesignIdFactory('static')
  const presets = [
    'pixel-line', 'smooth-line', 'outline-box', 'filled-box',
    'pixel-circle', 'smooth-circle', 'standard-text', 'tiny-text',
  ] as const
  return {
    ...createEmptyDisplayDesign('Static vocabulary'),
    displayMode: 'full-screen',
    elements: presets.map((preset) => createDefaultDisplayPrimitive(preset, ids)),
  }
}

function findingRules(document: DisplayDesignDocumentV1): string[] {
  return compileDisplayDesign(document).findings.map(({ ruleId }) => ruleId)
}

describe('display design compiler', () => {
  it('compiles every static target primitive in exact draw order with source mappings and metrics', () => {
    const document = staticPrimitiveDocument()
    const result = compileDisplayDesign(document)

    expect(result.commands).toEqual<DrawCommand[]>([
      { kind: 'line', x1: 8, y1: 16, x2: 32, y2: 16, shade: 15, smooth: false },
      { kind: 'line', x1: 8.5, y1: 16.5, x2: 32.5, y2: 16.5, shade: 15, smooth: true },
      { kind: 'box', x1: 8, y1: 16, x2: 32, y2: 24, shade: 15, fill: false, smooth: false },
      { kind: 'box', x1: 8, y1: 16, x2: 32, y2: 24, shade: 15, fill: true, smooth: false },
      { kind: 'circle', x: 20, y: 20, radius: 6, shade: 15, smooth: false },
      { kind: 'circle', x: 20.5, y: 20.5, radius: 6.5, shade: 15, smooth: true },
      { kind: 'text', x: 8, y: 20, text: 'Text', shade: 15, tiny: false, align: 'left' },
      { kind: 'text', x: 8, y: 20, text: 'Text', shade: 15, tiny: true, align: 'left' },
    ])
    expect(result.commandSources).toEqual(document.elements.map((element, firstCommand) => ({
      elementId: element.id, firstCommand, commandCount: 1,
    })))
    expect(result.metrics).toMatchObject({
      elementCount: 8,
      symbolCount: 0,
      instanceCount: 0,
      drawCallCount: 8,
      maximumVariantDrawCallCount: 8,
      smoothCallCount: 2,
    })
    const generated = generateDisplayDesignLua(document)
    expect(generated.ok).toBe(true)
    expect(result.metrics.generatedUtf8Bytes).toBe(generated.generatedUtf8Bytes)
  })

  it('resolves shared number, boolean, and text bindings with mapping, quantization, clamping, and inversion', () => {
    const ids = createSequentialDisplayDesignIdFactory('dynamic')
    const numberId = ids('binding')
    const booleanId = ids('binding')
    const textId = ids('binding')
    const bindings: DisplayDesignBinding[] = [
      { kind: 'number', id: numberId, name: 'Position', luaName: 'position', previewValue: 0.25 },
      { kind: 'boolean', id: booleanId, name: 'Enabled', luaName: 'enabled', previewValue: false },
      { kind: 'text', id: textId, name: 'Label', luaName: 'label', previewValue: 'Bound label' },
    ]
    const line = createDefaultDisplayPrimitive('pixel-line', ids)
    line.x1 = { kind: 'number-binding', bindingId: numberId, from: -10, to: 0, quantize: 'integer' }
    line.shade = { kind: 'number-binding', bindingId: numberId, from: 0, to: 15, quantize: 'integer' }
    line.visible = { kind: 'boolean-binding', bindingId: booleanId, invert: true }
    const smooth = createDefaultDisplayPrimitive('smooth-line', ids)
    smooth.x1 = { kind: 'number-binding', bindingId: numberId, from: 0, to: 1, quantize: 'none' }
    const text = createDefaultDisplayPrimitive('standard-text', ids)
    text.text = { kind: 'text-binding', bindingId: textId }
    const hidden = createDefaultDisplayPrimitive('filled-box', ids)
    hidden.visible = { kind: 'boolean-binding', bindingId: booleanId, invert: false }
    const document = { ...createEmptyDisplayDesign(), displayMode: 'full-screen' as const, bindings, elements: [line, smooth, text, hidden] }

    const result = compileDisplayDesign(document)
    expect(result.commands).toEqual([
      { kind: 'line', x1: -7, y1: 16, x2: 32, y2: 16, shade: 4, smooth: false },
      { kind: 'line', x1: 0.25, y1: 16.5, x2: 32.5, y2: 16.5, shade: 15, smooth: true },
      { kind: 'text', x: 8, y: 20, text: 'Bound label', shade: 15, tiny: false, align: 'left' },
    ])
    expect(result.commandSources).toHaveLength(3)
    expect(result.findings.map(({ ruleId }) => ruleId)).not.toContain('unused-binding')
  })

  it('reports clipping, complete overflow, and parameter-line overlap with stable focus targets', () => {
    const ids = createSequentialDisplayDesignIdFactory('bounds')
    const clipped = createDefaultDisplayPrimitive('outline-box', ids)
    clipped.x1 = { kind: 'literal', value: 12 }
    clipped.x2 = { kind: 'literal', value: -2 }
    clipped.y1 = { kind: 'literal', value: 12 }
    clipped.y2 = { kind: 'literal', value: 5 }
    const outside = createDefaultDisplayPrimitive('pixel-circle', ids)
    outside.x = { kind: 'literal', value: 300 }
    outside.y = { kind: 'literal', value: 30 }
    const reserved = createDefaultDisplayPrimitive('tiny-text', ids)
    reserved.x = { kind: 'literal', value: 20 }
    reserved.y = { kind: 'literal', value: 7 }
    const document = { ...createEmptyDisplayDesign(), elements: [clipped, outside, reserved] }

    const findings = compileDisplayDesign(document).findings
    expect(findings.map(({ ruleId }) => ruleId)).toEqual(expect.arrayContaining([
      'clipped-element', 'outside-artboard', 'reserved-row-overlap',
    ]))
    expect(findings.find(({ ruleId }) => ruleId === 'outside-artboard')?.focus).toEqual({ elementId: outside.id })
    expect(findings.filter(({ ruleId }) => ruleId === 'reserved-row-overlap').map(({ focus }) => focus)).toEqual([
      { elementId: clipped.id }, { elementId: reserved.id },
    ])
  })

  it('keeps hidden elements out of commands while retaining stored-element metrics', () => {
    const ids = createSequentialDisplayDesignIdFactory('hidden')
    const booleanId = ids('binding')
    const hidden = createDefaultDisplayPrimitive('pixel-line', ids)
    hidden.visible = { kind: 'boolean-binding', bindingId: booleanId, invert: false }
    const document: DisplayDesignDocumentV1 = {
      ...createEmptyDisplayDesign(),
      displayMode: 'full-screen',
      bindings: [{ kind: 'boolean', id: booleanId, name: 'Visible', luaName: 'visible', previewValue: false }],
      elements: [hidden],
    }
    const result = compileDisplayDesign(document)
    expect(result.commands).toEqual([])
    expect(result.commandSources).toEqual([])
    expect(result.metrics).toMatchObject({ elementCount: 1, drawCallCount: 0, maximumVariantDrawCallCount: 0 })
    expect(result.metrics.generatedUtf8Bytes).toBeGreaterThan(0)
  })

  it('exposes translation as the symbol-expansion seam and applies integer final boundaries', () => {
    const ids = createSequentialDisplayDesignIdFactory('translate')
    const pixel = createDefaultDisplayPrimitive('pixel-line', ids)
    const smooth = createDefaultDisplayPrimitive('smooth-line', ids)
    const bindings = createDisplayBindingMap([])

    expect(compileDisplayPrimitive(pixel, bindings, { x: 0.75, y: -0.75 })).toMatchObject({
      x1: 8, y1: 15, x2: 32, y2: 15,
    })
    expect(compileDisplayPrimitive(smooth, bindings, { x: 0.75, y: -0.75 })).toMatchObject({
      x1: 9.25, y1: 15.75, x2: 33.25, y2: 15.75,
    })
  })

  it('blocks malformed documents and symbol instances instead of emitting partial commands or Lua', () => {
    const invalid = staticPrimitiveDocument()
    invalid.name = ''
    expect(compileDisplayDesign(invalid)).toMatchObject({ commands: [], commandSources: [], metrics: { generatedUtf8Bytes: 0 } })
    expect(findingRules(invalid)).toContain('invalid-name')

    const ids = createSequentialDisplayDesignIdFactory('symbol')
    const variantId = ids('variant')
    const symbolId = ids('symbol')
    const primitive = createDefaultDisplayPrimitive('pixel-circle', ids, 'primitive')
    const withSymbol: DisplayDesignDocumentV1 = {
      ...createEmptyDisplayDesign(),
      symbols: [{ id: symbolId, name: 'Status', luaName: 'draw_status', defaultVariantId: variantId, variants: [{ id: variantId, name: 'Default', luaValue: 'default', elements: [primitive] }] }],
      elements: [{
        kind: 'symbol-instance', id: ids('element'), name: 'Status instance', symbolId,
        x: { kind: 'literal', value: 0 }, y: { kind: 'literal', value: 0 },
        visible: { kind: 'visible' }, state: { kind: 'literal', variantId },
      }],
    }
    const result = compileDisplayDesign(withSymbol)
    expect(result.commands).toEqual([])
    expect(result.metrics).toMatchObject({ elementCount: 1, symbolCount: 1, instanceCount: 1, generatedUtf8Bytes: 0 })
    expect(result.findings.map(({ ruleId }) => ruleId)).toContain('symbol-expansion-unavailable')
  })

  it('warns about unused bindings and symbol definitions without treating descriptive metrics as hardware limits', () => {
    const document = staticPrimitiveDocument()
    document.bindings = [{ kind: 'number', id: 'unused-binding', name: 'Unused', luaName: 'unused', previewValue: 0.5 }]
    const primitive: DisplayPrimitiveElement = createDefaultDisplayPrimitive('pixel-line', () => 'symbol-primitive', 'primitive')
    document.symbols = [{
      id: 'unused-symbol', name: 'Unused symbol', luaName: 'draw_unused', defaultVariantId: 'unused-variant',
      variants: [{ id: 'unused-variant', name: 'Default', luaValue: 'default', elements: [primitive] }],
    }]
    const result = compileDisplayDesign(document)
    expect(result.findings.map(({ ruleId }) => ruleId)).toEqual(expect.arrayContaining(['unused-binding', 'unused-symbol']))
    expect(result.metrics).toMatchObject({ elementCount: 9, symbolCount: 1, instanceCount: 0, drawCallCount: 8 })
  })
})
