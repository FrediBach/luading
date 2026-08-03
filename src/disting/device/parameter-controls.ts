import type { ParameterDefinition } from '../types'

export type ParameterControlKind =
  | 'continuous'
  | 'stepped'
  | 'bipolar'
  | 'enum-segmented'
  | 'enum-menu'

export const DEFAULT_PARAMETER_PAGE_SIZE = 8

export function parameterStep(definition: ParameterDefinition) {
  if (definition.enumValues) return 1
  const scale = Number.isFinite(definition.scale) && definition.scale > 0
    ? definition.scale
    : 1
  return 1 / scale
}

function randomUnit(random: () => number) {
  const sample = random()
  if (!Number.isFinite(sample)) return 0
  return Math.min(1 - Number.EPSILON, Math.max(0, sample))
}

function integerBound(value: number, direction: 'min' | 'max') {
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(value)) * 8
  return direction === 'min'
    ? Math.ceil(value - tolerance)
    : Math.floor(value + tolerance)
}

export function randomParameterValue(
  definition: ParameterDefinition,
  random: () => number = Math.random,
) {
  const scale = definition.enumValues ? 1 : 1 / parameterStep(definition)
  const minimum = integerBound(definition.min * scale, 'min')
  const maximum = integerBound(definition.max * scale, 'max')
  if (maximum < minimum) return definition.min

  const valueCount = maximum - minimum + 1
  const tick = minimum + Math.floor(randomUnit(random) * valueCount)
  return tick / scale
}

export function parameterControlKind(
  definition: ParameterDefinition,
): ParameterControlKind {
  if (definition.enumValues) {
    return definition.enumValues.length <= 4 ? 'enum-segmented' : 'enum-menu'
  }
  if (definition.min < 0 && definition.max > 0) return 'bipolar'
  return parameterStep(definition) >= 1 ? 'stepped' : 'continuous'
}

export function parameterPrecision(definition: ParameterDefinition) {
  if (definition.enumValues) return 0
  const step = parameterStep(definition)
  if (step >= 1) return 0
  return Math.min(3, Math.max(0, Math.ceil(-Math.log10(step))))
}

export function formatParameterValue(
  definition: ParameterDefinition,
  value: number,
) {
  if (definition.enumValues) {
    return definition.enumValues[
      Math.round(value) - (definition.enumOffset ?? 1)
    ] ?? `Option ${Math.round(value)}`
  }
  return value.toFixed(parameterPrecision(definition))
}

export function parameterPageCount(
  parameterCount: number,
  pageSize = DEFAULT_PARAMETER_PAGE_SIZE,
) {
  if (pageSize <= 0) return 1
  return Math.max(1, Math.ceil(Math.max(0, parameterCount) / pageSize))
}

export function clampParameterPage(
  page: number,
  parameterCount: number,
  pageSize = DEFAULT_PARAMETER_PAGE_SIZE,
) {
  const lastPage = parameterPageCount(parameterCount, pageSize) - 1
  if (!Number.isFinite(page)) return 0
  return Math.min(lastPage, Math.max(0, Math.floor(page)))
}

export function parameterPageRange(
  page: number,
  parameterCount: number,
  pageSize = DEFAULT_PARAMETER_PAGE_SIZE,
) {
  const safePage = clampParameterPage(page, parameterCount, pageSize)
  const start = safePage * pageSize
  return {
    page: safePage,
    start,
    end: Math.min(parameterCount, start + pageSize),
  }
}
