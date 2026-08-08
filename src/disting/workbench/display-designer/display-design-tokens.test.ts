import { describe, expect, it } from 'vitest'
import { createDefaultDisplayPrimitive, createEmptyDisplayDesign, createSequentialDisplayDesignIdFactory } from './display-design-model'
import { createDisplayBindingInDocument } from './display-design-bindings'
import {
  createDisplayTokenInDocument,
  deleteDisplayTokenWithSubstitution,
  deleteUnusedDisplayToken,
  listDisplayTokenUsages,
  reorderDisplayToken,
  updateDisplayToken,
} from './display-design-tokens'

describe('display design tokens', () => {
  it('creates collision-safe ordered tokens and renames by stable identity', () => {
    const ids = createSequentialDisplayDesignIdFactory('token')
    let document = createEmptyDisplayDesign()
    document = createDisplayBindingInDocument(document, 'number', ids, 'Spacing').document
    const first = createDisplayTokenInDocument(document, ids, 'Spacing', -0)
    const second = createDisplayTokenInDocument(first.document, ids, 'Spacing', 3)
    expect(first.token).toMatchObject({ luaName: 'spacing_2', value: 0 })
    expect(second.token.luaName).toBe('spacing_3')
    const renamed = updateDisplayToken(second.document, first.token.id, { name: 'Bar width' })
    expect(renamed.tokens[0]).toMatchObject({ id: first.token.id, name: 'Bar width', luaName: 'bar_width' })
    expect(reorderDisplayToken(renamed, 1, 0).tokens.map(({ id }) => id)).toEqual([second.token.id, first.token.id])
  })

  it('discovers scene, symbol, instance, and binding-endpoint uses once per property', () => {
    const ids = createSequentialDisplayDesignIdFactory('usage')
    const created = createDisplayTokenInDocument(createEmptyDisplayDesign(), ids, 'Width', 12)
    const line = createDefaultDisplayPrimitive('pixel-line', ids)
    line.x1 = { kind: 'token-expression', expression: { kind: 'binary', operator: 'add', left: { kind: 'token', tokenId: created.token.id }, right: { kind: 'token', tokenId: created.token.id } } }
    line.x2 = { kind: 'number-binding', bindingId: 'value', from: { kind: 'token-expression', expression: { kind: 'token', tokenId: created.token.id } }, to: { kind: 'literal', value: 20 }, quantize: 'integer' }
    const document = { ...created.document, elements: [line] }
    expect(listDisplayTokenUsages(document).map(({ property, endpoint }) => [property, endpoint])).toEqual([['x1', undefined], ['x2', 'from']])
  })

  it('blocks direct deletion of used tokens and substitutes only the deleted leaves on confirmation', () => {
    const ids = createSequentialDisplayDesignIdFactory('delete')
    const first = createDisplayTokenInDocument(createEmptyDisplayDesign(), ids, 'Width', 12)
    const second = createDisplayTokenInDocument(first.document, ids, 'Gap', 3)
    const line = createDefaultDisplayPrimitive('pixel-line', ids)
    line.x1 = { kind: 'token-expression', expression: { kind: 'binary', operator: 'add', left: { kind: 'token', tokenId: first.token.id }, right: { kind: 'token', tokenId: second.token.id } } }
    const document = { ...second.document, elements: [line] }
    expect(deleteUnusedDisplayToken(document, first.token.id).tokens).toHaveLength(2)
    const deleted = deleteDisplayTokenWithSubstitution(document, first.token.id)
    expect(deleted.tokens.map(({ id }) => id)).toEqual([second.token.id])
    expect(deleted.elements[0]).toMatchObject({ x1: { kind: 'token-expression', expression: { kind: 'binary', left: { kind: 'number', value: 12 }, right: { kind: 'token', tokenId: second.token.id } } } })
  })

  it('discovers and substitutes tokens on Bézier control points', () => {
    const ids = createSequentialDisplayDesignIdFactory('bezier-token')
    const created = createDisplayTokenInDocument(createEmptyDisplayDesign(), ids, 'Control X', 19)
    const bezier = createDefaultDisplayPrimitive('bezier', ids)
    bezier.points[2]!.x = { kind: 'token-expression', expression: { kind: 'token', tokenId: created.token.id } }
    const document = { ...created.document, elements: [bezier] }

    expect(listDisplayTokenUsages(document)).toEqual([expect.objectContaining({ tokenId: created.token.id, property: 'points[2].x' })])
    const substituted = deleteDisplayTokenWithSubstitution(document, created.token.id).elements[0]
    expect(substituted?.kind === 'bezier' ? substituted.points[2]?.x : undefined).toEqual({ kind: 'literal', value: 19 })
  })
})
