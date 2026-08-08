import type {
  DisplayDesignBinding,
  DisplayScalar,
  DisplayStaticScalar,
  DisplayText,
  DisplayVisibility,
} from './display-design-model'
import { cloneDisplayDesign } from './display-design-model'
import {
  createDisplayTokenMap,
  displayTokenExpressionToStaticScalar,
  displayStaticScalarToTokenExpression,
  formatDisplayDesignNumber,
  printDisplayTokenExpression,
  resolveDisplayTokenExpression,
  type DisplayTokenMap,
} from './display-design-token-expressions'

export type DisplayBindingMap = ReadonlyMap<string, DisplayDesignBinding>

function sourceNumber(value: number): number {
  const normalized = Number(value.toPrecision(12))
  return Object.is(normalized, -0) ? 0 : normalized
}

export function createDisplayBindingMap(bindings: DisplayDesignBinding[]): DisplayBindingMap {
  return new Map(bindings.map((binding) => [binding.id, binding]))
}

export { createDisplayTokenMap }

export function resolveDisplayStaticScalar(scalar: DisplayStaticScalar, tokens: DisplayTokenMap): number {
  return scalar.kind === 'literal'
    ? sourceNumber(scalar.value)
    : resolveDisplayTokenExpression(scalar.expression, tokens)
}

export function resolveDisplayScalar(
  scalar: DisplayScalar,
  bindings: DisplayBindingMap,
  tokens: DisplayTokenMap = createDisplayTokenMap([]),
): number {
  if (scalar.kind !== 'number-binding') return resolveDisplayStaticScalar(scalar, tokens)
  const binding = bindings.get(scalar.bindingId)
  const previewValue = sourceNumber(binding?.kind === 'number' ? binding.previewValue : 0)
  const from = resolveDisplayStaticScalar(scalar.from, tokens)
  const to = resolveDisplayStaticScalar(scalar.to, tokens)
  const delta = scalar.from.kind === 'literal' && scalar.to.kind === 'literal'
    ? sourceNumber(to - from)
    : to - from
  const mapped = from + delta * previewValue
  const resolved = scalar.quantize === 'integer' ? Math.round(mapped) : mapped
  return Object.is(resolved, -0) ? 0 : resolved
}

export function offsetDisplayStaticScalar(scalar: DisplayStaticScalar, delta: number): DisplayStaticScalar {
  if (delta === 0) return cloneDisplayDesign(scalar)
  if (scalar.kind === 'literal') return { kind: 'literal', value: sourceNumber(scalar.value + delta) }
  return displayTokenExpressionToStaticScalar({
    kind: 'binary',
    operator: delta < 0 ? 'subtract' : 'add',
    left: cloneDisplayDesign(scalar.expression),
    right: { kind: 'number', value: Math.abs(delta) },
  })
}

export function addDisplayStaticScalars(left: DisplayStaticScalar, right: DisplayStaticScalar): DisplayStaticScalar {
  return displayTokenExpressionToStaticScalar({
    kind: 'binary',
    operator: 'add',
    left: displayStaticScalarToTokenExpression(left),
    right: displayStaticScalarToTokenExpression(right),
  })
}

export function addDisplayScalarStatic(scalar: DisplayScalar, offset: DisplayStaticScalar): DisplayScalar {
  if (scalar.kind !== 'number-binding') return addDisplayStaticScalars(scalar, offset)
  return {
    ...cloneDisplayDesign(scalar),
    from: addDisplayStaticScalars(scalar.from, offset),
    to: addDisplayStaticScalars(scalar.to, offset),
  }
}

export function offsetDisplayScalar(scalar: DisplayScalar, delta: number): DisplayScalar {
  if (scalar.kind !== 'number-binding') return offsetDisplayStaticScalar(scalar, delta)
  return {
    ...cloneDisplayDesign(scalar),
    from: offsetDisplayStaticScalar(scalar.from, delta),
    to: offsetDisplayStaticScalar(scalar.to, delta),
  }
}

export function setDisplayScalarPreviewValue(
  scalar: DisplayScalar,
  nextValue: number,
  bindings: DisplayBindingMap,
  tokens: DisplayTokenMap,
): DisplayScalar {
  return offsetDisplayScalar(scalar, sourceNumber(nextValue - resolveDisplayScalar(scalar, bindings, tokens)))
}

export function resolveDisplayVisibility(visibility: DisplayVisibility, bindings: DisplayBindingMap): boolean {
  if (visibility.kind === 'visible') return true
  const binding = bindings.get(visibility.bindingId)
  const previewValue = binding?.kind === 'boolean' ? binding.previewValue : false
  return visibility.invert ? !previewValue : previewValue
}

export function resolveDisplayText(text: DisplayText, bindings: DisplayBindingMap): string {
  if (text.kind === 'literal') return text.value
  const binding = bindings.get(text.bindingId)
  return binding?.kind === 'text' ? binding.previewValue : ''
}

export function formatLuaNumber(value: number): string {
  return formatDisplayDesignNumber(value)
}

export function displayStaticScalarLuaExpression(
  scalar: DisplayStaticScalar,
  tokens: DisplayTokenMap,
  forceInteger = false,
): string {
  const expression = scalar.kind === 'literal'
    ? formatLuaNumber(forceInteger ? Math.round(scalar.value) : scalar.value)
    : printDisplayTokenExpression(scalar.expression, tokens)
  return forceInteger && scalar.kind === 'token-expression'
    ? `math.floor((${expression}) + 0.5)`
    : expression
}

function mappedBindingExpression(
  scalar: Extract<DisplayScalar, { kind: 'number-binding' }>,
  luaName: string,
  tokens: DisplayTokenMap,
): string {
  if (scalar.from.kind !== 'literal' || scalar.to.kind !== 'literal') {
    const from = displayStaticScalarLuaExpression(scalar.from, tokens)
    const to = displayStaticScalarLuaExpression(scalar.to, tokens)
    return `(${from}) + ((${to}) - (${from})) * ${luaName}`
  }
  const from = scalar.from.value
  const delta = sourceNumber(scalar.to.value - from)
  if (delta === 0) return formatLuaNumber(from)
  if (from === 0 && delta === 1) return luaName
  if (from === 0 && delta === -1) return `-${luaName}`
  const magnitude = Math.abs(delta)
  const scaled = magnitude === 1 ? luaName : `${formatLuaNumber(magnitude)} * ${luaName}`
  if (from === 0) return delta < 0 ? `-${scaled}` : scaled
  return `${formatLuaNumber(from)} ${delta < 0 ? '-' : '+'} ${scaled}`
}

export function displayScalarLuaExpression(
  scalar: DisplayScalar,
  bindings: DisplayBindingMap,
  forceInteger = false,
  tokens: DisplayTokenMap = createDisplayTokenMap([]),
): string {
  if (scalar.kind !== 'number-binding') return displayStaticScalarLuaExpression(scalar, tokens, forceInteger)
  const binding = bindings.get(scalar.bindingId)
  const luaName = binding?.kind === 'number' ? binding.luaName : '0'
  const mapped = mappedBindingExpression(scalar, luaName, tokens)
  return forceInteger || scalar.quantize === 'integer'
    ? `math.floor((${mapped}) + 0.5)`
    : mapped
}

export function displayShadeLuaExpression(
  scalar: DisplayScalar,
  bindings: DisplayBindingMap,
  tokens: DisplayTokenMap = createDisplayTokenMap([]),
): string {
  if (scalar.kind === 'literal') return formatLuaNumber(Math.min(15, Math.max(0, Math.round(scalar.value))))
  const mapped = displayScalarLuaExpression(scalar, bindings, true, tokens)
  return `math.max(0, math.min(15, ${mapped}))`
}
