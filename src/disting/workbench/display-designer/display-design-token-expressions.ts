import {
  DISPLAY_DESIGN_LIMITS,
  type DisplayDesignToken,
  type DisplayStaticScalar,
  type DisplayTokenExpression,
} from './display-design-model'

export type DisplayTokenMap = ReadonlyMap<string, DisplayDesignToken>

export interface DisplayTokenExpressionSuccess {
  ok: true
  expression: DisplayTokenExpression
}

export interface DisplayTokenExpressionFailure {
  ok: false
  message: string
  offset: number
}

export type DisplayTokenExpressionParseResult = DisplayTokenExpressionSuccess | DisplayTokenExpressionFailure

export function createDisplayTokenMap(tokens: DisplayDesignToken[]): DisplayTokenMap {
  return new Map(tokens.map((token) => [token.id, token]))
}

export function formatDisplayDesignNumber(value: number): string {
  const normalized = Number(value.toPrecision(12))
  return String(Object.is(normalized, -0) ? 0 : normalized).replace('e+', 'e')
}

function normalizedNumber(value: number): number {
  const normalized = Number(value.toPrecision(12))
  if (!Number.isFinite(normalized)) throw new Error('Formula result must be finite.')
  return Object.is(normalized, -0) ? 0 : normalized
}

function finiteArithmeticResult(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Formula result must be finite.')
  return Object.is(value, -0) ? 0 : value
}

function evaluateLiteralExpression(expression: DisplayTokenExpression): number | undefined {
  if (expression.kind === 'number') return expression.value
  if (expression.kind === 'token') return undefined
  if (expression.kind === 'negate') {
    const operand = evaluateLiteralExpression(expression.operand)
    return operand === undefined ? undefined : normalizedNumber(-operand)
  }
  const left = evaluateLiteralExpression(expression.left)
  const right = evaluateLiteralExpression(expression.right)
  if (left === undefined || right === undefined) return undefined
  if (expression.operator === 'divide' && right === 0) throw new Error('Division by zero is not allowed.')
  const value = expression.operator === 'add' ? left + right
    : expression.operator === 'subtract' ? left - right
      : expression.operator === 'multiply' ? left * right
        : left / right
  return normalizedNumber(value)
}

export function normalizeDisplayTokenExpression(expression: DisplayTokenExpression): DisplayTokenExpression {
  if (expression.kind === 'number') return { kind: 'number', value: normalizedNumber(expression.value) }
  if (expression.kind === 'token') return { kind: 'token', tokenId: expression.tokenId }
  if (expression.kind === 'negate') {
    const operand = normalizeDisplayTokenExpression(expression.operand)
    if (operand.kind === 'negate') return operand.operand
    if (operand.kind === 'number') return { kind: 'number', value: normalizedNumber(-operand.value) }
    return { kind: 'negate', operand }
  }
  const left = normalizeDisplayTokenExpression(expression.left)
  const right = normalizeDisplayTokenExpression(expression.right)
  const normalized: DisplayTokenExpression = { kind: 'binary', operator: expression.operator, left, right }
  const literal = evaluateLiteralExpression(normalized)
  return literal === undefined ? normalized : { kind: 'number', value: literal }
}

export function displayTokenExpressionToStaticScalar(expression: DisplayTokenExpression): DisplayStaticScalar {
  const normalized = normalizeDisplayTokenExpression(expression)
  return normalized.kind === 'number'
    ? { kind: 'literal', value: normalized.value }
    : { kind: 'token-expression', expression: normalized }
}

export function displayStaticScalarToTokenExpression(scalar: DisplayStaticScalar): DisplayTokenExpression {
  return scalar.kind === 'literal'
    ? { kind: 'number', value: scalar.value }
    : structuredClone(scalar.expression)
}

class FormulaParser {
  private offset = 0
  private nodes = 0
  private depth = 0
  private readonly byLuaName: ReadonlyMap<string, DisplayDesignToken>
  private readonly source: string

  constructor(source: string, tokens: DisplayDesignToken[]) {
    this.source = source
    this.byLuaName = new Map(tokens.map((token) => [token.luaName, token]))
  }

  parse(): DisplayTokenExpressionParseResult {
    try {
      if ([...this.source].length > DISPLAY_DESIGN_LIMITS.maximumFormulaCodePoints) {
        return { ok: false, message: `Formula must be at most ${DISPLAY_DESIGN_LIMITS.maximumFormulaCodePoints} characters.`, offset: 0 }
      }
      const expression = this.additive()
      this.whitespace()
      if (this.offset !== this.source.length) this.fail('Unexpected input.')
      return { ok: true, expression: normalizeDisplayTokenExpression(expression) }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Invalid formula.',
        offset: this.offset,
      }
    }
  }

  private fail(message: string): never {
    throw new Error(message)
  }

  private node(expression: DisplayTokenExpression): DisplayTokenExpression {
    this.nodes += 1
    if (this.nodes > DISPLAY_DESIGN_LIMITS.maximumExpressionNodes) {
      this.fail(`Formula must contain at most ${DISPLAY_DESIGN_LIMITS.maximumExpressionNodes} expression nodes.`)
    }
    return expression
  }

  private nested<T>(read: () => T): T {
    this.depth += 1
    if (this.depth > DISPLAY_DESIGN_LIMITS.maximumExpressionDepth) {
      this.fail(`Formula must be at most ${DISPLAY_DESIGN_LIMITS.maximumExpressionDepth} levels deep.`)
    }
    try {
      return read()
    } finally {
      this.depth -= 1
    }
  }

  private whitespace(): void {
    while (/\s/u.test(this.source[this.offset] ?? '')) this.offset += 1
  }

  private consume(value: string): boolean {
    this.whitespace()
    if (!this.source.startsWith(value, this.offset)) return false
    this.offset += value.length
    return true
  }

  private additive(): DisplayTokenExpression {
    let left = this.multiplicative()
    while (true) {
      if (this.consume('+')) left = this.node({ kind: 'binary', operator: 'add', left, right: this.multiplicative() })
      else if (this.consume('-')) left = this.node({ kind: 'binary', operator: 'subtract', left, right: this.multiplicative() })
      else return left
    }
  }

  private multiplicative(): DisplayTokenExpression {
    let left = this.unary()
    while (true) {
      if (this.consume('*')) left = this.node({ kind: 'binary', operator: 'multiply', left, right: this.unary() })
      else if (this.consume('/')) left = this.node({ kind: 'binary', operator: 'divide', left, right: this.unary() })
      else return left
    }
  }

  private unary(): DisplayTokenExpression {
    if (this.consume('-')) return this.node({ kind: 'negate', operand: this.nested(() => this.unary()) })
    return this.primary()
  }

  private primary(): DisplayTokenExpression {
    this.whitespace()
    if (this.consume('(')) {
      const expression = this.nested(() => this.additive())
      if (!this.consume(')')) this.fail('Expected “)”.')
      return expression
    }
    const remainder = this.source.slice(this.offset)
    const number = /^(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?/u.exec(remainder)?.[0]
    if (number) {
      this.offset += number.length
      const value = Number(number)
      if (!Number.isFinite(value)) this.fail('Numeric literals must be finite.')
      return this.node({ kind: 'number', value })
    }
    const identifier = /^[A-Za-z_][A-Za-z0-9_]*/u.exec(remainder)?.[0]
    if (identifier) {
      this.offset += identifier.length
      const token = this.byLuaName.get(identifier)
      if (!token) this.fail(`Unknown design token “${identifier}”.`)
      return this.node({ kind: 'token', tokenId: token.id })
    }
    this.fail(this.offset >= this.source.length ? 'Expected a number, token, or parenthesized expression.' : 'Unsupported formula input.')
  }
}

export function parseDisplayTokenExpression(
  source: string,
  tokens: DisplayDesignToken[],
): DisplayTokenExpressionParseResult {
  return new FormulaParser(source, tokens).parse()
}

export function parseDisplayStaticScalarFormula(
  source: string,
  tokens: DisplayDesignToken[],
): ({ ok: true; scalar: DisplayStaticScalar } | DisplayTokenExpressionFailure) {
  const result = parseDisplayTokenExpression(source, tokens)
  return result.ok ? { ok: true, scalar: displayTokenExpressionToStaticScalar(result.expression) } : result
}

export function collectDisplayTokenExpressionReferences(expression: DisplayTokenExpression): Set<string> {
  const references = new Set<string>()
  const visit = (node: DisplayTokenExpression): void => {
    if (node.kind === 'token') references.add(node.tokenId)
    else if (node.kind === 'negate') visit(node.operand)
    else if (node.kind === 'binary') {
      visit(node.left)
      visit(node.right)
    }
  }
  visit(expression)
  return references
}

export function resolveDisplayTokenExpression(
  expression: DisplayTokenExpression,
  tokens: DisplayTokenMap,
): number {
  const visit = (node: DisplayTokenExpression): number => {
    if (node.kind === 'number') return normalizedNumber(node.value)
    if (node.kind === 'token') {
      const token = tokens.get(node.tokenId)
      if (!token) throw new Error(`Unknown design token ID “${node.tokenId}”.`)
      return normalizedNumber(token.value)
    }
    if (node.kind === 'negate') return finiteArithmeticResult(-visit(node.operand))
    const left = visit(node.left)
    const right = visit(node.right)
    if (node.operator === 'divide' && right === 0) throw new Error('Division by zero is not allowed.')
    return finiteArithmeticResult(node.operator === 'add' ? left + right
      : node.operator === 'subtract' ? left - right
        : node.operator === 'multiply' ? left * right
          : left / right)
  }
  return visit(expression)
}

function precedence(expression: DisplayTokenExpression): number {
  if (expression.kind === 'number' || expression.kind === 'token') return 4
  if (expression.kind === 'negate') return 3
  return expression.operator === 'multiply' || expression.operator === 'divide' ? 2 : 1
}

export function printDisplayTokenExpression(
  expression: DisplayTokenExpression,
  tokens: DisplayTokenMap,
): string {
  const visit = (node: DisplayTokenExpression, parentPrecedence = 0, rightChild = false, parentOperator?: string): string => {
    const ownPrecedence = precedence(node)
    let source: string
    if (node.kind === 'number') source = formatDisplayDesignNumber(node.value)
    else if (node.kind === 'token') source = tokens.get(node.tokenId)?.luaName ?? `missing_token_${node.tokenId.replace(/[^A-Za-z0-9_]/gu, '_')}`
    else if (node.kind === 'negate') source = `-${visit(node.operand, ownPrecedence)}`
    else {
      const operator = node.operator === 'add' ? '+' : node.operator === 'subtract' ? '-' : node.operator === 'multiply' ? '*' : '/'
      source = `${visit(node.left, ownPrecedence, false, node.operator)} ${operator} ${visit(node.right, ownPrecedence, true, node.operator)}`
    }
    const rightOperatorNeedsParentheses = rightChild && node.kind === 'binary' && (
      parentOperator === 'subtract'
      || parentOperator === 'divide'
      || parentOperator === 'add' && node.operator === 'subtract'
      || parentOperator === 'multiply' && node.operator === 'divide'
    )
    const needsParentheses = ownPrecedence < parentPrecedence
      || (ownPrecedence === parentPrecedence && rightOperatorNeedsParentheses)
    return needsParentheses ? `(${source})` : source
  }
  return visit(expression)
}

export function substituteDisplayTokenExpressionReference(
  expression: DisplayTokenExpression,
  tokenId: string,
  value: number,
): DisplayTokenExpression {
  const replace = (node: DisplayTokenExpression): DisplayTokenExpression => {
    if (node.kind === 'token') return node.tokenId === tokenId ? { kind: 'number', value } : { ...node }
    if (node.kind === 'number') return { ...node }
    if (node.kind === 'negate') return { kind: 'negate', operand: replace(node.operand) }
    return { kind: 'binary', operator: node.operator, left: replace(node.left), right: replace(node.right) }
  }
  return normalizeDisplayTokenExpression(replace(expression))
}
