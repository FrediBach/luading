import { describe, expect, it } from 'vitest'
import {
  alignDisplayElements,
  clientToLogical,
  constrainDisplayCreationPoint,
  constrainDisplayPointerTranslation,
  createDisplayPrimitiveFromGesture,
  displayAreaBounds,
  displayElementBounds,
  displayElementHitTest,
  displayElementsWithinArea,
  displaySelectionBounds,
  distributeDisplayElements,
  logicalToClient,
  reorderDisplayDesignSelection,
  resizeDisplayElement,
  screenTargetToLogical,
  snapDisplayCoordinate,
  translateDisplayElements,
} from './display-design-geometry'
import {
  addDisplayDesignElement,
  createDefaultDisplayPrimitive,
  createEmptyDisplayDesign,
  createSequentialDisplayDesignIdFactory,
} from './display-design-model'
import { collectDisplayTokenExpressionReferences } from './display-design-token-expressions'
import { staticDisplayScalarValue } from './display-design-bindings'

const literal = (value: number) => ({ kind: 'literal' as const, value })

describe('display design geometry', () => {
  it.each([1, 2, 3, 4])('round trips logical coordinates through %s× CSS bounds', (zoom) => {
    const rect = { left: 17.25, top: 30.5, width: 256 * zoom, height: 64 * zoom }
    const logical = { x: 83.5, y: 12.25 }
    expect(clientToLogical(logicalToClient(logical, rect), rect)).toEqual(logical)
    expect(screenTargetToLogical(12, rect)).toEqual({ x: 12 / zoom, y: 12 / zoom })
  })

  it('supports fractional fit bounds and integer/half-pixel snapping', () => {
    const rect = { left: 4.75, top: 9.25, width: 511.5, height: 127.875 }
    expect(clientToLogical({ x: 260.5, y: 73.1875 }, rect)).toEqual({ x: 128, y: 32 })
    expect(snapDisplayCoordinate(12.26, false)).toBe(12)
    expect(snapDisplayCoordinate(12.26, true)).toBe(12.5)
    expect(constrainDisplayCreationPoint({ x: -3, y: 4 }, 'parameter-line', false)).toEqual({ x: 0, y: 10 })
    expect(constrainDisplayCreationPoint({ x: 300, y: 90 }, 'full-screen', true)).toEqual({ x: 255, y: 63 })
    const ids = createSequentialDisplayDesignIdFactory('constraint')
    const element = createDefaultDisplayPrimitive('filled-box', ids)
    const document = addDisplayDesignElement(createEmptyDisplayDesign(), element)
    expect(constrainDisplayPointerTranslation(document, [element.id], { x: -100, y: -20 })).toEqual({ x: -100, y: -6 })
  })

  it('creates every gesture geometry with reserved-row constraints', () => {
    const ids = createSequentialDisplayDesignIdFactory('gesture')
    const line = createDisplayPrimitiveFromGesture('pixel-line', { x: 2.2, y: 4 }, { x: 19.7, y: 13.6 }, 'parameter-line', ids)
    expect(line).toMatchObject({ kind: 'line', x1: literal(2), y1: literal(10), x2: literal(20), y2: literal(14) })
    const smooth = createDisplayPrimitiveFromGesture('smooth-line', { x: 2.2, y: 12.2 }, { x: 19.7, y: 13.6 }, 'full-screen', ids)
    expect(smooth).toMatchObject({ x1: literal(2), y1: literal(12), x2: literal(19.5), y2: literal(13.5) })
    const box = createDisplayPrimitiveFromGesture('filled-box', { x: 20, y: 30 }, { x: 5, y: 12 }, 'full-screen', ids)
    expect(displayElementBounds(box)).toEqual({ left: 5, top: 12, right: 20, bottom: 30 })
    const circle = createDisplayPrimitiveFromGesture('smooth-circle', { x: 10, y: 10 }, { x: 13, y: 14 }, 'full-screen', ids)
    expect(circle).toMatchObject({ kind: 'circle', radius: literal(5) })
    const text = createDisplayPrimitiveFromGesture('tiny-text', { x: 1.2, y: 2.2 }, { x: 90, y: 40 }, 'full-screen', ids)
    expect(text).toMatchObject({ kind: 'text', x: literal(1), y: literal(2) })
  })

  it('calculates reversed boxes, circles, text, multi-selection, and enlarged hits', () => {
    const ids = createSequentialDisplayDesignIdFactory('bounds')
    const box = { ...createDefaultDisplayPrimitive('outline-box', ids), x1: literal(30), y1: literal(25), x2: literal(10), y2: literal(15) }
    const circle = { ...createDefaultDisplayPrimitive('pixel-circle', ids), x: literal(50), y: literal(30), radius: literal(7) }
    const text = { ...createDefaultDisplayPrimitive('tiny-text', ids), x: literal(80), y: literal(20), align: 'right' as const }
    let document = addDisplayDesignElement(createEmptyDisplayDesign(), box)
    document = addDisplayDesignElement(document, circle)
    document = addDisplayDesignElement(document, text)
    expect(displayElementBounds(box)).toEqual({ left: 10, top: 15, right: 30, bottom: 25 })
    expect(displayElementBounds(circle)).toEqual({ left: 43, top: 23, right: 57, bottom: 37 })
    expect(displayElementBounds(text).right).toBe(79)
    expect(displaySelectionBounds(document, [box.id, circle.id])).toEqual({ left: 10, top: 15, right: 57, bottom: 37 })
    expect(displayElementHitTest(box, { x: 20, y: 14.4 }, 1)).toBe(true)
    expect(displayElementHitTest(box, { x: 20, y: 20 }, 1)).toBe(false)
    expect(displayElementHitTest(circle, { x: 57.8, y: 30 }, 1)).toBe(true)
  })

  it('finds layers fully enclosed by a drag area in either direction', () => {
    const ids = createSequentialDisplayDesignIdFactory('area')
    const first = { ...createDefaultDisplayPrimitive('filled-box', ids), x1: literal(10), y1: literal(10), x2: literal(30), y2: literal(20) }
    const second = { ...createDefaultDisplayPrimitive('filled-box', ids), x1: literal(40), y1: literal(15), x2: literal(60), y2: literal(25) }
    let document = addDisplayDesignElement(createEmptyDisplayDesign(), first)
    document = addDisplayDesignElement(document, second)

    expect(displayAreaBounds({ x: 35, y: 30 }, { x: 5, y: 5 })).toEqual({ left: 5, top: 5, right: 35, bottom: 30 })
    expect(displayElementsWithinArea(document, { x: 35, y: 30 }, { x: 5, y: 5 })).toEqual([first.id])
    expect(displayElementsWithinArea(document, { x: 5, y: 5 }, { x: 50, y: 30 })).toEqual([first.id])
    expect(displayElementsWithinArea(document, { x: 65, y: 30 }, { x: 5, y: 5 })).toEqual([first.id, second.id])
  })

  it('moves off canvas and resizes element-specific handles without clamping', () => {
    const ids = createSequentialDisplayDesignIdFactory('move')
    const line = createDefaultDisplayPrimitive('pixel-line', ids)
    const box = { ...createDefaultDisplayPrimitive('outline-box', ids), x1: literal(30), y1: literal(25), x2: literal(10), y2: literal(15) }
    let document = addDisplayDesignElement(createEmptyDisplayDesign(), line)
    document = addDisplayDesignElement(document, box)
    document = translateDisplayElements(document, [line.id, box.id], -50, 80)
    expect(displaySelectionBounds(document, [line.id, box.id])).toEqual({ left: -42, top: 95, right: -18, bottom: 105 })
    expect(resizeDisplayElement(line, 'end', { x: 22.6, y: 18.4 })).toMatchObject({ x2: literal(23), y2: literal(18) })
    expect(resizeDisplayElement(box, 'top-left', { x: 4.4, y: 5.6 })).toMatchObject({ x1: literal(30), y1: literal(25), x2: literal(4), y2: literal(6) })
    const circle = createDefaultDisplayPrimitive('smooth-circle', ids)
    expect(resizeDisplayElement(circle, 'radius', { x: 24.5, y: 23.5 })).toMatchObject({ radius: literal(5) })
  })

  it('preserves token formulas and runtime spans through move, align, distribute, and every resize handle', () => {
    const ids = createSequentialDisplayDesignIdFactory('formula-geometry')
    const token = { id: ids('token'), name: 'Origin', luaName: 'origin', value: 8 }
    const formula = () => ({ kind: 'token-expression' as const, expression: { kind: 'token' as const, tokenId: token.id } })
    const bindingId = ids('binding')
    const line = createDefaultDisplayPrimitive('pixel-line', ids)
    line.x1 = formula()
    line.x2 = { kind: 'number-binding', bindingId, from: formula(), to: { kind: 'token-expression', expression: { kind: 'binary', operator: 'add', left: { kind: 'token', tokenId: token.id }, right: { kind: 'number', value: 10 } } }, quantize: 'integer' }
    const box = createDefaultDisplayPrimitive('outline-box', ids)
    box.x1 = formula(); box.y1 = formula(); box.x2 = formula(); box.y2 = formula()
    const circle = createDefaultDisplayPrimitive('pixel-circle', ids)
    circle.x = formula(); circle.y = formula(); circle.radius = formula()
    const text = createDefaultDisplayPrimitive('tiny-text', ids)
    text.x = formula(); text.y = formula()
    const document = {
      ...createEmptyDisplayDesign(), tokens: [token], elements: [line, box, circle, text],
      bindings: [{ kind: 'number' as const, id: bindingId, name: 'Position', luaName: 'position', previewValue: 0.5 }],
    }
    const moved = translateDisplayElements(document, document.elements.map(({ id }) => id), 5, -2)
    const movedLine = moved.elements[0]!
    if (movedLine.kind !== 'line') throw new Error('Expected line')
    expect(staticDisplayScalarValue(moved, movedLine.x1)).toBe(13)
    expect(movedLine.x1.kind === 'token-expression' ? collectDisplayTokenExpressionReferences(movedLine.x1.expression) : new Set()).toEqual(new Set([token.id]))
    expect(movedLine.x2).toMatchObject({ kind: 'number-binding', from: { kind: 'token-expression' }, to: { kind: 'token-expression' } })

    for (const handle of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
      const resized = resizeDisplayElement(box, handle, { x: 20, y: 30 }, document)
      if (resized.kind !== 'box') throw new Error('Expected box')
      for (const property of ['x1', 'y1', 'x2', 'y2'] as const) {
        expect(resized[property].kind).toBe('token-expression')
      }
    }
    expect(resizeDisplayElement(line, 'start', { x: 20, y: 30 }, document)).toMatchObject({ x1: { kind: 'token-expression' } })
    expect(resizeDisplayElement(line, 'end', { x: 20, y: 30 }, document)).toMatchObject({ x2: { kind: 'number-binding', from: { kind: 'token-expression' }, to: { kind: 'token-expression' } } })
    expect(resizeDisplayElement(circle, 'centre', { x: 20, y: 30 }, document)).toMatchObject({ x: { kind: 'token-expression' }, y: { kind: 'token-expression' } })
    expect(resizeDisplayElement(circle, 'radius', { x: 20, y: 8 }, document)).toMatchObject({ radius: { kind: 'token-expression' } })
    expect(resizeDisplayElement(text, 'anchor', { x: 20, y: 30 }, document)).toMatchObject({ x: { kind: 'token-expression' }, y: { kind: 'token-expression' } })

    const aligned = alignDisplayElements(document, [line.id, box.id], 'left')
    const distributed = distributeDisplayElements({ ...document, elements: [line, box, circle] }, [line.id, box.id, circle.id], 'horizontal')
    expect(JSON.stringify(aligned)).toContain('"tokenId":"' + token.id + '"')
    expect(JSON.stringify(distributed)).toContain('"tokenId":"' + token.id + '"')
  })

  it('uses the current symbol state bounds for instance hit testing and movement', () => {
    const ids = createSequentialDisplayDesignIdFactory('instance-bounds')
    const primitive = createDefaultDisplayPrimitive('filled-box', ids, 'primitive')
    primitive.x1 = literal(-2); primitive.y1 = literal(1); primitive.x2 = literal(6); primitive.y2 = literal(4)
    const symbolId = ids('symbol'); const variantId = ids('variant')
    const instance = {
      kind: 'symbol-instance' as const, id: ids('element'), name: 'Instance', symbolId,
      x: literal(20), y: literal(30), visible: { kind: 'visible' as const },
      state: { kind: 'literal' as const, variantId },
    }
    const document = {
      ...createEmptyDisplayDesign(),
      symbols: [{ id: symbolId, name: 'Symbol', luaName: 'draw_symbol', defaultVariantId: variantId, variants: [{ id: variantId, name: 'Default', luaValue: 'default', elements: [primitive] }] }],
      elements: [instance],
    }
    expect(displayElementBounds(instance, document)).toEqual({ left: 18, top: 31, right: 26, bottom: 34 })
    expect(displayElementHitTest(instance, { x: 25, y: 33 }, 0.5, document)).toBe(true)
  })

  it('aligns, distributes, and translates back-to-front selection ordering', () => {
    const ids = createSequentialDisplayDesignIdFactory('ops')
    const elements = [0, 1, 2].map((index) => ({
      ...createDefaultDisplayPrimitive('filled-box', ids),
      name: String(index),
      x1: literal(index === 0 ? 0 : index === 1 ? 30 : 80),
      x2: literal(index === 0 ? 9 : index === 1 ? 39 : 89),
      y1: literal(index * 10), y2: literal(index * 10 + 9),
    }))
    let document = elements.reduce((current, element) => addDisplayDesignElement(current, element), createEmptyDisplayDesign())
    document = alignDisplayElements(document, elements.map(({ id }) => id), 'left')
    expect(document.elements.map((element) => displayElementBounds(element).left)).toEqual([0, 0, 0])
    document = translateDisplayElements(document, [elements[1].id], 30, 0)
    document = translateDisplayElements(document, [elements[2].id], 80, 0)
    document = distributeDisplayElements(document, elements.map(({ id }) => id), 'horizontal')
    expect(document.elements.map((element) => displayElementBounds(element).left)).toEqual([0, 40, 80])
    document = reorderDisplayDesignSelection(document, [elements[0].id, elements[1].id], 'front')
    expect(document.elements.map(({ name }) => name)).toEqual(['2', '0', '1'])
    document = reorderDisplayDesignSelection(document, [elements[0].id], 'backward')
    expect(document.elements.map(({ name }) => name)).toEqual(['0', '2', '1'])
    document = reorderDisplayDesignSelection(document, [elements[0].id], 'forward')
    expect(document.elements.map(({ name }) => name)).toEqual(['2', '0', '1'])
    document = reorderDisplayDesignSelection(document, [elements[0].id], 'back')
    expect(document.elements.map(({ name }) => name)).toEqual(['0', '2', '1'])
  })
})
