import {
  cloneDisplayDesign,
  type DisplayDesignDocument,
  type DisplayDesignIdFactory,
  type DisplayDesignToken,
  type DisplayPrimitiveElement,
  type DisplayScalar,
  type DisplayStaticScalar,
} from './display-design-model'
import { allocateDisplayLuaIdentifier } from './display-design-lua-identifiers'
import {
  collectDisplayTokenExpressionReferences,
  displayTokenExpressionToStaticScalar,
  substituteDisplayTokenExpressionReference,
} from './display-design-token-expressions'

export interface DisplayTokenUsage {
  tokenId: string
  ownerKind: 'element' | 'symbol-primitive' | 'binding-endpoint'
  ownerId: string
  ownerName: string
  property: string
  symbolId?: string
  variantId?: string
  endpoint?: 'from' | 'to'
}

function usedLuaNames(document: DisplayDesignDocument, exceptTokenId?: string): string[] {
  return [
    ...document.tokens.filter(({ id }) => id !== exceptTokenId).map(({ luaName }) => luaName),
    ...document.bindings.map(({ luaName }) => luaName),
    ...document.symbols.map(({ luaName }) => luaName),
  ]
}

export function createDisplayTokenInDocument(
  document: DisplayDesignDocument,
  idFactory: DisplayDesignIdFactory,
  name = 'Number token',
  value = 0,
): { document: DisplayDesignDocument; token: DisplayDesignToken } {
  const token: DisplayDesignToken = {
    id: idFactory('token'),
    name,
    luaName: allocateDisplayLuaIdentifier(name, usedLuaNames(document), 'token'),
    value: Object.is(value, -0) ? 0 : value,
  }
  return {
    token,
    document: { ...cloneDisplayDesign(document), tokens: [...cloneDisplayDesign(document.tokens), token] },
  }
}

export function updateDisplayToken(
  document: DisplayDesignDocument,
  tokenId: string,
  update: Partial<Pick<DisplayDesignToken, 'name' | 'value'>>,
): DisplayDesignDocument {
  return {
    ...cloneDisplayDesign(document),
    tokens: document.tokens.map((token) => {
      if (token.id !== tokenId) return cloneDisplayDesign(token)
      const name = update.name ?? token.name
      return {
        ...cloneDisplayDesign(token),
        name,
        luaName: update.name === undefined
          ? token.luaName
          : allocateDisplayLuaIdentifier(name, usedLuaNames(document, tokenId), 'token'),
        value: update.value === undefined ? token.value : (Object.is(update.value, -0) ? 0 : update.value),
      }
    }),
  }
}

export function reorderDisplayToken(
  document: DisplayDesignDocument,
  fromIndex: number,
  toIndex: number,
): DisplayDesignDocument {
  const tokens = cloneDisplayDesign(document.tokens)
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= tokens.length) return cloneDisplayDesign(document)
  const destination = Math.max(0, Math.min(Math.trunc(toIndex), tokens.length - 1))
  const [token] = tokens.splice(fromIndex, 1)
  if (!token) return cloneDisplayDesign(document)
  tokens.splice(destination, 0, token)
  return { ...cloneDisplayDesign(document), tokens }
}

function scalarReferences(scalar: DisplayStaticScalar): Set<string> {
  return scalar.kind === 'token-expression'
    ? collectDisplayTokenExpressionReferences(scalar.expression)
    : new Set()
}

function primitiveScalars(primitive: DisplayPrimitiveElement): Array<[string, DisplayScalar]> {
  if (primitive.kind === 'pixel-box') return [['x', primitive.x], ['y', primitive.y]]
  const common: Array<[string, DisplayScalar]> = [['shade', primitive.shade]]
  if (primitive.kind === 'animated-line') {
    return [...common, ['secondaryShade', primitive.secondaryShade], ['x1', primitive.x1], ['y1', primitive.y1], ['x2', primitive.x2], ['y2', primitive.y2]]
  }
  if (primitive.kind === 'line' || primitive.kind === 'box') {
    return [...common, ['x1', primitive.x1], ['y1', primitive.y1], ['x2', primitive.x2], ['y2', primitive.y2]]
  }
  if (primitive.kind === 'circle' || primitive.kind === 'polygon') return [...common, ['x', primitive.x], ['y', primitive.y], ['radius', primitive.radius]]
  if (primitive.kind === 'bezier') return [
    ...common,
    ...primitive.points.flatMap((point, index): Array<[string, DisplayScalar]> => [
      [`points[${index}].x`, point.x],
      [`points[${index}].y`, point.y],
    ]),
  ]
  return [...common, ['x', primitive.x], ['y', primitive.y]]
}

function addScalarUsages(
  usages: DisplayTokenUsage[],
  scalar: DisplayScalar,
  context: Omit<DisplayTokenUsage, 'tokenId' | 'property' | 'endpoint'>,
  property: string,
): void {
  if (scalar.kind === 'token-expression') {
    for (const tokenId of scalarReferences(scalar)) usages.push({ ...context, tokenId, property })
  } else if (scalar.kind === 'number-binding') {
    for (const endpoint of ['from', 'to'] as const) {
      for (const tokenId of scalarReferences(scalar[endpoint])) {
        usages.push({ ...context, tokenId, property, endpoint })
      }
    }
  }
}

export function listDisplayTokenUsages(document: DisplayDesignDocument): DisplayTokenUsage[] {
  const usages: DisplayTokenUsage[] = []
  for (const element of document.elements) {
    if (element.kind === 'symbol-instance') {
      addScalarUsages(usages, element.x, { ownerKind: 'element', ownerId: element.id, ownerName: element.name }, 'x')
      addScalarUsages(usages, element.y, { ownerKind: 'element', ownerId: element.id, ownerName: element.name }, 'y')
    } else {
      for (const [property, scalar] of primitiveScalars(element)) {
        addScalarUsages(usages, scalar, { ownerKind: 'element', ownerId: element.id, ownerName: element.name }, property)
      }
    }
  }
  for (const symbol of document.symbols) {
    for (const variant of symbol.variants) {
      for (const primitive of variant.elements) {
        for (const [property, scalar] of primitiveScalars(primitive)) {
          addScalarUsages(usages, scalar, {
            ownerKind: 'symbol-primitive',
            ownerId: primitive.id,
            ownerName: `${symbol.name} / ${variant.name} / ${primitive.name}`,
            symbolId: symbol.id,
            variantId: variant.id,
          }, property)
        }
      }
    }
  }
  return usages
}

function substituteStaticScalar(scalar: DisplayStaticScalar, tokenId: string, value: number): DisplayStaticScalar {
  if (scalar.kind === 'literal') return cloneDisplayDesign(scalar)
  return displayTokenExpressionToStaticScalar(substituteDisplayTokenExpressionReference(scalar.expression, tokenId, value))
}

function substituteScalar(scalar: DisplayScalar, tokenId: string, value: number): DisplayScalar {
  if (scalar.kind === 'number-binding') {
    return {
      ...cloneDisplayDesign(scalar),
      from: substituteStaticScalar(scalar.from, tokenId, value),
      to: substituteStaticScalar(scalar.to, tokenId, value),
    }
  }
  return substituteStaticScalar(scalar, tokenId, value)
}

function substitutePrimitive(primitive: DisplayPrimitiveElement, tokenId: string, value: number): DisplayPrimitiveElement {
  const next = cloneDisplayDesign(primitive)
  if (next.kind === 'pixel-box') {
    next.x = substituteScalar(next.x, tokenId, value)
    next.y = substituteScalar(next.y, tokenId, value)
    return next
  }
  next.shade = substituteScalar(next.shade, tokenId, value)
  if (next.kind === 'animated-line') {
    next.secondaryShade = substituteScalar(next.secondaryShade, tokenId, value)
    next.x1 = substituteScalar(next.x1, tokenId, value)
    next.y1 = substituteScalar(next.y1, tokenId, value)
    next.x2 = substituteScalar(next.x2, tokenId, value)
    next.y2 = substituteScalar(next.y2, tokenId, value)
  } else if (next.kind === 'line' || next.kind === 'box') {
    next.x1 = substituteScalar(next.x1, tokenId, value)
    next.y1 = substituteScalar(next.y1, tokenId, value)
    next.x2 = substituteScalar(next.x2, tokenId, value)
    next.y2 = substituteScalar(next.y2, tokenId, value)
  } else if (next.kind === 'circle' || next.kind === 'polygon') {
    next.x = substituteScalar(next.x, tokenId, value)
    next.y = substituteScalar(next.y, tokenId, value)
    next.radius = substituteScalar(next.radius, tokenId, value)
  } else if (next.kind === 'bezier') {
    next.points = next.points.map((point) => ({
      x: substituteScalar(point.x, tokenId, value),
      y: substituteScalar(point.y, tokenId, value),
    }))
  } else {
    next.x = substituteScalar(next.x, tokenId, value)
    next.y = substituteScalar(next.y, tokenId, value)
  }
  return next
}

export function deleteDisplayTokenWithSubstitution(
  document: DisplayDesignDocument,
  tokenId: string,
): DisplayDesignDocument {
  const token = document.tokens.find(({ id }) => id === tokenId)
  if (!token) return cloneDisplayDesign(document)
  return {
    ...cloneDisplayDesign(document),
    tokens: document.tokens.filter(({ id }) => id !== tokenId).map(cloneDisplayDesign),
    elements: document.elements.map((element) => {
      if (element.kind !== 'symbol-instance') return substitutePrimitive(element, tokenId, token.value)
      return {
        ...cloneDisplayDesign(element),
        x: substituteScalar(element.x, tokenId, token.value),
        y: substituteScalar(element.y, tokenId, token.value),
      }
    }),
    symbols: document.symbols.map((symbol) => ({
      ...cloneDisplayDesign(symbol),
      variants: symbol.variants.map((variant) => ({
        ...cloneDisplayDesign(variant),
        elements: variant.elements.map((primitive) => substitutePrimitive(primitive, tokenId, token.value)),
      })),
    })),
  }
}

export function deleteUnusedDisplayToken(document: DisplayDesignDocument, tokenId: string): DisplayDesignDocument {
  if (listDisplayTokenUsages(document).some((usage) => usage.tokenId === tokenId)) return cloneDisplayDesign(document)
  return { ...cloneDisplayDesign(document), tokens: document.tokens.filter(({ id }) => id !== tokenId).map(cloneDisplayDesign) }
}
