import { describe, expect, it } from 'vitest'
import type { DisplayDesignToken, DisplayTokenExpression } from './display-design-model'
import {
  collectDisplayTokenExpressionReferences,
  createDisplayTokenMap,
  normalizeDisplayTokenExpression,
  parseDisplayStaticScalarFormula,
  parseDisplayTokenExpression,
  printDisplayTokenExpression,
  resolveDisplayTokenExpression,
  substituteDisplayTokenExpressionReference,
} from './display-design-token-expressions'

const tokens: DisplayDesignToken[] = [
  { id: 'width', name: 'Bar width', luaName: 'bar_width', value: 12 },
  { id: 'gap', name: 'Bar gap', luaName: 'bar_gap', value: 3 },
  { id: 'start', name: 'Start X', luaName: 'start_x', value: 8 },
]

function parsed(source: string): DisplayTokenExpression {
  const result = parseDisplayTokenExpression(source, tokens)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.message)
  return result.expression
}

describe('display design token expressions', () => {
  it('parses precedence, associativity, unary minus, whitespace, decimals, and exponents', () => {
    const expression = parsed(' start_x + 2 * (bar_width + bar_gap) - -1.5e1 ')
    expect(resolveDisplayTokenExpression(expression, createDisplayTokenMap(tokens))).toBe(53)
    expect(printDisplayTokenExpression(expression, createDisplayTokenMap(tokens))).toBe('start_x + 2 * (bar_width + bar_gap) - -15')
    expect(printDisplayTokenExpression(parsed('bar_width - (bar_gap - start_x)'), createDisplayTokenMap(tokens))).toBe('bar_width - (bar_gap - start_x)')
    expect(printDisplayTokenExpression(parsed('bar_width * (start_x / bar_gap)'), createDisplayTokenMap(tokens))).toBe('bar_width * (start_x / bar_gap)')
  })

  it('normalizes literal-only formulas and double negation without reordering token terms', () => {
    expect(parseDisplayStaticScalarFormula('1 + 2 * 3', tokens)).toEqual({ ok: true, scalar: { kind: 'literal', value: 7 } })
    const expression = normalizeDisplayTokenExpression({ kind: 'negate', operand: { kind: 'negate', operand: { kind: 'token', tokenId: 'width' } } })
    expect(expression).toEqual({ kind: 'token', tokenId: 'width' })
  })

  it('rejects unknown identifiers, unsupported syntax, trailing input, non-finite literals, and division by zero', () => {
    for (const source of ['missing + 1', 'math.max(1, 2)', 'bar_width % 2', '1e999', '1 / 0', 'bar_width trailing']) {
      expect(parseDisplayTokenExpression(source, tokens).ok, source).toBe(false)
    }
  })

  it('enforces editable source, node, and depth limits', () => {
    expect(parseDisplayTokenExpression('1'.repeat(257), tokens).ok).toBe(false)
    expect(parseDisplayTokenExpression(Array.from({ length: 70 }, () => 'bar_width').join(' + '), tokens).ok).toBe(false)
    expect(parseDisplayTokenExpression(`${'-'.repeat(17)}bar_width`, tokens).ok).toBe(false)
  })

  it('stores token IDs so renames print safely and substitution preserves other links', () => {
    const expression = parsed('bar_width + bar_gap + bar_width')
    expect(collectDisplayTokenExpressionReferences(expression)).toEqual(new Set(['width', 'gap']))
    const renamed = tokens.map((token) => token.id === 'width' ? { ...token, luaName: 'meter_width' } : token)
    expect(printDisplayTokenExpression(expression, createDisplayTokenMap(renamed))).toBe('meter_width + bar_gap + meter_width')
    const substituted = substituteDisplayTokenExpressionReference(expression, 'width', 12)
    expect(printDisplayTokenExpression(substituted, createDisplayTokenMap(tokens))).toBe('12 + bar_gap + 12')
  })

  it('rejects token-driven division by zero during evaluation', () => {
    const expression = parsed('bar_width / bar_gap')
    const zeroGap = tokens.map((token) => token.id === 'gap' ? { ...token, value: 0 } : token)
    expect(() => resolveDisplayTokenExpression(expression, createDisplayTokenMap(zeroGap))).toThrow('Division by zero')
  })
})
