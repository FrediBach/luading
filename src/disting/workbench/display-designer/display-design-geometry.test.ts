import { describe, expect, it } from 'vitest'
import {
  alignDisplayElements,
  clientToLogical,
  constrainDisplayCreationPoint,
  constrainDisplayPointerTranslation,
  createDisplayPrimitiveFromGesture,
  displayElementBounds,
  displayElementHitTest,
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

const literal = (value: number) => ({ kind: 'literal' as const, value })

describe('display design geometry', () => {
  it.each([2, 3, 4])('round trips logical coordinates through %s× CSS bounds', (zoom) => {
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

  it('moves off canvas and resizes element-specific handles without clamping', () => {
    const ids = createSequentialDisplayDesignIdFactory('move')
    const line = createDefaultDisplayPrimitive('pixel-line', ids)
    const box = { ...createDefaultDisplayPrimitive('outline-box', ids), x1: literal(30), y1: literal(25), x2: literal(10), y2: literal(15) }
    let document = addDisplayDesignElement(createEmptyDisplayDesign(), line)
    document = addDisplayDesignElement(document, box)
    document = translateDisplayElements(document, [line.id, box.id], -50, 80)
    expect(displaySelectionBounds(document, [line.id, box.id])).toEqual({ left: -42, top: 95, right: -18, bottom: 105 })
    expect(resizeDisplayElement(line, 'end', { x: 22.6, y: 18.4 })).toMatchObject({ x2: literal(23), y2: literal(18) })
    expect(resizeDisplayElement(box, 'top-left', { x: 4.4, y: 5.6 })).toMatchObject({ x1: literal(4), y1: literal(6), x2: literal(30), y2: literal(25) })
    const circle = createDefaultDisplayPrimitive('smooth-circle', ids)
    expect(resizeDisplayElement(circle, 'radius', { x: 24.5, y: 23.5 })).toMatchObject({ radius: literal(5) })
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
