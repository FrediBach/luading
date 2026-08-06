import type {
  DisplayDesignBinding,
  DisplayScalar,
  DisplayText,
  DisplayVisibility,
} from './display-design-model'

export type DisplayBindingMap = ReadonlyMap<string, DisplayDesignBinding>

function sourceNumber(value: number): number {
  const normalized = Number(value.toPrecision(12))
  return Object.is(normalized, -0) ? 0 : normalized
}

export function createDisplayBindingMap(bindings: DisplayDesignBinding[]): DisplayBindingMap {
  return new Map(bindings.map((binding) => [binding.id, binding]))
}

export function resolveDisplayScalar(scalar: DisplayScalar, bindings: DisplayBindingMap): number {
  if (scalar.kind === 'literal') return sourceNumber(scalar.value)
  const binding = bindings.get(scalar.bindingId)
  const previewValue = sourceNumber(binding?.kind === 'number' ? binding.previewValue : 0)
  const from = sourceNumber(scalar.from)
  const delta = sourceNumber(scalar.to - scalar.from)
  const mapped = from + delta * previewValue
  const resolved = scalar.quantize === 'integer' ? Math.round(mapped) : mapped
  return Object.is(resolved, -0) ? 0 : resolved
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
  const normalized = sourceNumber(value)
  return String(normalized).replace('e+', 'e')
}

function mappedBindingExpression(scalar: Extract<DisplayScalar, { kind: 'number-binding' }>, luaName: string): string {
  const delta = sourceNumber(scalar.to - scalar.from)
  if (delta === 0) return formatLuaNumber(scalar.from)
  if (scalar.from === 0 && delta === 1) return luaName
  if (scalar.from === 0 && delta === -1) return `-${luaName}`
  const magnitude = Math.abs(delta)
  const scaled = magnitude === 1 ? luaName : `${formatLuaNumber(magnitude)} * ${luaName}`
  if (scalar.from === 0) return delta < 0 ? `-${scaled}` : scaled
  return `${formatLuaNumber(scalar.from)} ${delta < 0 ? '-' : '+'} ${scaled}`
}

export function displayScalarLuaExpression(
  scalar: DisplayScalar,
  bindings: DisplayBindingMap,
  forceInteger = false,
): string {
  if (scalar.kind === 'literal') return formatLuaNumber(forceInteger ? Math.round(scalar.value) : scalar.value)
  const binding = bindings.get(scalar.bindingId)
  const luaName = binding?.kind === 'number' ? binding.luaName : '0'
  const mapped = mappedBindingExpression(scalar, luaName)
  return forceInteger || scalar.quantize === 'integer'
    ? `math.floor((${mapped}) + 0.5)`
    : mapped
}

export function displayShadeLuaExpression(scalar: DisplayScalar, bindings: DisplayBindingMap): string {
  if (scalar.kind === 'literal') return formatLuaNumber(Math.min(15, Math.max(0, Math.round(scalar.value))))
  const mapped = displayScalarLuaExpression(scalar, bindings, true)
  return `math.max(0, math.min(15, ${mapped}))`
}
