import {
  DISPLAY_DESIGN_KIND,
  DISPLAY_DESIGN_LIMITS,
  DISPLAY_DESIGN_VERSION,
  DISPLAY_DESIGN_VERSION_V1,
  DISPLAY_DESIGN_VERSION_V2,
  DISPLAY_DESIGN_VERSION_V3,
  DISPLAY_DESIGN_VERSION_V4,
  DISPLAY_DESIGN_VERSION_V5,
  type DisplayChoiceBindingChoice,
  type DisplayDesignBinding,
  type DisplayDesignDocument,
  type DisplayDesignLayoutGrid,
  type DisplayDesignerFinding,
  type DisplayDesignerFindingFocus,
  type DisplayDesignElement,
  type DisplayDesignGroup,
  type DisplayDesignSymbol,
  type DisplayDesignToken,
  type DisplayPrimitiveElement,
  type DisplayScalar,
  type DisplayScalarQuantization,
  type DisplayStaticScalar,
  type DisplayTokenExpression,
  type DisplaySymbolState,
  type DisplaySymbolVariant,
  type DisplayText,
  type DisplayVisibility,
} from './display-design-model'
import { isSafeDisplayLuaIdentifier } from './display-design-lua-identifiers'
import { collectDisplayTokenExpressionReferences, createDisplayTokenMap } from './display-design-token-expressions'
import { listDisplayTokenUsages } from './display-design-tokens'
import { createDisplayBindingMap, resolveDisplayScalar } from './display-design-resolution'

export interface DisplayDesignValidationResult {
  ok: boolean
  document?: DisplayDesignDocument
  findings: DisplayDesignerFinding[]
}

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function codePointLength(value: string): number {
  return [...value].length
}

function validateLayoutGrid(
  validator: Validator,
  value: unknown,
): DisplayDesignLayoutGrid | null {
  if (value === null) return null
  if (!isRecord(value)) {
    validator.finding('invalid-layout-grid', 'Layout grid must be a uniform grid object or null.', 'layoutGrid')
    return null
  }
  validator.keys(value, ['kind', 'size', 'color', 'opacity'], 'layoutGrid')
  if (value.kind !== 'uniform') {
    validator.finding('invalid-layout-grid-kind', 'Layout grid kind must be “uniform”.', 'layoutGrid.kind')
  }
  const size = typeof value.size === 'number' && Number.isInteger(value.size)
    && value.size >= DISPLAY_DESIGN_LIMITS.minimumLayoutGridSize
    && value.size <= DISPLAY_DESIGN_LIMITS.maximumLayoutGridSize
    ? value.size
    : 8
  if (size !== value.size) {
    validator.finding(
      'invalid-layout-grid-size',
      `Layout grid size must be a whole number from ${DISPLAY_DESIGN_LIMITS.minimumLayoutGridSize} through ${DISPLAY_DESIGN_LIMITS.maximumLayoutGridSize}.`,
      'layoutGrid.size',
    )
  }
  const color = typeof value.color === 'string' && /^#[0-9a-f]{6}$/u.test(value.color)
    ? value.color
    : '#ff0000'
  if (color !== value.color) {
    validator.finding('invalid-layout-grid-color', 'Layout grid color must be a normalized six-digit hexadecimal RGB value.', 'layoutGrid.color')
  }
  const opacity = typeof value.opacity === 'number' && Number.isInteger(value.opacity)
    && value.opacity >= DISPLAY_DESIGN_LIMITS.minimumLayoutGridOpacity
    && value.opacity <= DISPLAY_DESIGN_LIMITS.maximumLayoutGridOpacity
    ? value.opacity
    : 10
  if (opacity !== value.opacity) {
    validator.finding(
      'invalid-layout-grid-opacity',
      `Layout grid opacity must be a whole percentage from ${DISPLAY_DESIGN_LIMITS.minimumLayoutGridOpacity} through ${DISPLAY_DESIGN_LIMITS.maximumLayoutGridOpacity}.`,
      'layoutGrid.opacity',
    )
  }
  return { kind: 'uniform', size, color, opacity }
}

class Validator {
  readonly findings: DisplayDesignerFinding[] = []
  readonly ids = new Map<string, string>()

  readonly sourceVersion: 1 | 2 | 3 | 4 | 5 | 6

  constructor(sourceVersion: 1 | 2 | 3 | 4 | 5 | 6) {
    this.sourceVersion = sourceVersion
  }

  finding(
    ruleId: string,
    message: string,
    path: string,
    focus?: DisplayDesignerFindingFocus,
    severity: DisplayDesignerFinding['severity'] = 'error',
  ): void {
    this.findings.push({ ruleId, severity, message, path, ...(focus ? { focus } : {}) })
  }

  keys(value: RecordValue, allowed: readonly string[], path: string, focus?: DisplayDesignerFindingFocus): void {
    const allowedKeys = new Set(allowed)
    for (const key of Object.keys(value).sort()) {
      if (!allowedKeys.has(key)) this.finding('unknown-key', `Unknown property “${key}”.`, `${path}.${key}`, { ...focus, property: key })
    }
  }

  id(value: unknown, path: string, focus?: DisplayDesignerFindingFocus): string {
    const hasUnsafeCharacter = typeof value === 'string' && [...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return /\s/u.test(character) || codePoint < 32 || codePoint === 127
    })
    if (typeof value !== 'string' || value.length === 0 || value.length > 128 || hasUnsafeCharacter) {
      this.finding('invalid-id', 'IDs must be non-empty opaque strings without whitespace or control characters.', path, focus)
      return `invalid:${path}`
    }
    const previousPath = this.ids.get(value)
    if (previousPath) this.finding('duplicate-id', `ID “${value}” is already used at ${previousPath}.`, path, focus)
    else this.ids.set(value, path)
    return value
  }

  name(value: unknown, path: string, fallback: string, focus?: DisplayDesignerFindingFocus): string {
    if (typeof value !== 'string') {
      this.finding('invalid-name', `A name from 1 through ${DISPLAY_DESIGN_LIMITS.maximumNameCodePoints} characters is required.`, path, focus)
      return fallback
    }
    const normalized = value.trim()
    if (codePointLength(normalized) < 1 || codePointLength(normalized) > DISPLAY_DESIGN_LIMITS.maximumNameCodePoints) {
      this.finding('invalid-name', `A name from 1 through ${DISPLAY_DESIGN_LIMITS.maximumNameCodePoints} characters is required.`, path, focus)
      return fallback
    }
    return normalized
  }

  luaIdentifier(value: unknown, path: string, fallback: string, focus?: DisplayDesignerFindingFocus): string {
    if (
      typeof value !== 'string'
      || !isSafeDisplayLuaIdentifier(value)
    ) {
      this.finding('invalid-lua-identifier', 'A safe, non-reserved Lua identifier is required.', path, focus)
      return fallback
    }
    return value
  }

  stableValue(value: unknown, path: string, fallback: string, focus?: DisplayDesignerFindingFocus): string {
    if (typeof value !== 'string') {
      this.finding('invalid-lua-value', `A state value from 1 through ${DISPLAY_DESIGN_LIMITS.maximumNameCodePoints} characters is required.`, path, focus)
      return fallback
    }
    const normalized = value.trim()
    if (codePointLength(normalized) < 1 || codePointLength(normalized) > DISPLAY_DESIGN_LIMITS.maximumNameCodePoints) {
      this.finding('invalid-lua-value', `A state value from 1 through ${DISPLAY_DESIGN_LIMITS.maximumNameCodePoints} characters is required.`, path, focus)
      return fallback
    }
    return normalized
  }

  array(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) {
      this.finding('invalid-array', 'An array is required.', path)
      return []
    }
    return value
  }

  boolean(value: unknown, path: string, fallback: boolean, focus?: DisplayDesignerFindingFocus): boolean {
    if (typeof value !== 'boolean') {
      this.finding('invalid-boolean', 'A boolean value is required.', path, focus)
      return fallback
    }
    return value
  }

  finiteNumber(
    value: unknown,
    path: string,
    fallback: number,
    minimum: number = DISPLAY_DESIGN_LIMITS.minimumCoordinate,
    maximum: number = DISPLAY_DESIGN_LIMITS.maximumCoordinate,
    focus?: DisplayDesignerFindingFocus,
  ): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
      this.finding('invalid-number', `A finite number from ${minimum} through ${maximum} is required.`, path, focus)
      return fallback
    }
    return Object.is(value, -0) ? 0 : value
  }

  tokenExpression(
    value: unknown,
    path: string,
    focus?: DisplayDesignerFindingFocus,
    state = { nodes: 0 },
    depth = 1,
  ): DisplayTokenExpression {
    state.nodes += 1
    if (state.nodes > DISPLAY_DESIGN_LIMITS.maximumExpressionNodes) {
      this.finding('expression-node-limit', `A formula may contain at most ${DISPLAY_DESIGN_LIMITS.maximumExpressionNodes} expression nodes.`, path, focus)
    }
    if (depth > DISPLAY_DESIGN_LIMITS.maximumExpressionDepth) {
      this.finding('expression-depth-limit', `A formula may be at most ${DISPLAY_DESIGN_LIMITS.maximumExpressionDepth} levels deep.`, path, focus)
    }
    if (!isRecord(value)) {
      this.finding('invalid-token-expression', 'A token expression object is required.', path, focus)
      return { kind: 'number', value: 0 }
    }
    if (value.kind === 'number') {
      this.keys(value, ['kind', 'value'], path, focus)
      return { kind: 'number', value: this.finiteNumber(value.value, `${path}.value`, 0) }
    }
    if (value.kind === 'token') {
      this.keys(value, ['kind', 'tokenId'], path, focus)
      const tokenId = typeof value.tokenId === 'string' && value.tokenId.length > 0 ? value.tokenId : ''
      if (!tokenId) this.finding('invalid-token-reference', 'A token ID is required.', `${path}.tokenId`, focus)
      return { kind: 'token', tokenId }
    }
    if (value.kind === 'negate') {
      this.keys(value, ['kind', 'operand'], path, focus)
      return { kind: 'negate', operand: this.tokenExpression(value.operand, `${path}.operand`, focus, state, depth + 1) }
    }
    if (value.kind === 'binary') {
      this.keys(value, ['kind', 'operator', 'left', 'right'], path, focus)
      const operator = value.operator === 'add' || value.operator === 'subtract' || value.operator === 'multiply' || value.operator === 'divide'
        ? value.operator
        : 'add'
      if (operator !== value.operator) this.finding('invalid-expression-operator', 'Formula operator must be add, subtract, multiply, or divide.', `${path}.operator`, focus)
      return {
        kind: 'binary',
        operator,
        left: this.tokenExpression(value.left, `${path}.left`, focus, state, depth + 1),
        right: this.tokenExpression(value.right, `${path}.right`, focus, state, depth + 1),
      }
    }
    this.keys(value, ['kind'], path, focus)
    this.finding('invalid-token-expression-kind', 'Formula node kind must be number, token, negate, or binary.', `${path}.kind`, focus)
    return { kind: 'number', value: 0 }
  }

  staticScalar(
    value: unknown,
    path: string,
    options: { minimum?: number; maximum?: number; focus?: DisplayDesignerFindingFocus; integerLiteral?: boolean },
  ): DisplayStaticScalar {
    const minimum = options.minimum ?? DISPLAY_DESIGN_LIMITS.minimumCoordinate
    const maximum = options.maximum ?? DISPLAY_DESIGN_LIMITS.maximumCoordinate
    if (!isRecord(value)) {
      this.finding('invalid-static-scalar', 'A literal or token-expression scalar is required.', path, options.focus)
      return { kind: 'literal', value: Math.max(0, minimum) }
    }
    if (value.kind === 'literal') {
      this.keys(value, ['kind', 'value'], path, options.focus)
      const number = this.finiteNumber(value.value, `${path}.value`, Math.max(0, minimum), minimum, maximum, options.focus)
      if (options.integerLiteral && !Number.isInteger(number)) {
        this.finding('integer-required', 'This literal property requires a whole number.', `${path}.value`, options.focus)
      }
      return { kind: 'literal', value: options.integerLiteral ? Math.round(number) : number }
    }
    if (value.kind === 'token-expression' && this.sourceVersion >= DISPLAY_DESIGN_VERSION_V3) {
      this.keys(value, ['kind', 'expression'], path, options.focus)
      return { kind: 'token-expression', expression: this.tokenExpression(value.expression, `${path}.expression`, options.focus) }
    }
    this.keys(value, ['kind'], path, options.focus)
    this.finding('invalid-static-scalar-kind', 'Static scalar kind must be “literal” or “token-expression”.', `${path}.kind`, options.focus)
    return { kind: 'literal', value: Math.max(0, minimum) }
  }

  scalar(
    value: unknown,
    path: string,
    options: { integer: boolean; minimum?: number; maximum?: number; focus?: DisplayDesignerFindingFocus },
  ): DisplayScalar {
    const minimum = options.minimum ?? DISPLAY_DESIGN_LIMITS.minimumCoordinate
    const maximum = options.maximum ?? DISPLAY_DESIGN_LIMITS.maximumCoordinate
    if (!isRecord(value)) {
      this.finding('invalid-scalar', 'A literal, token-expression, or number-binding scalar is required.', path, options.focus)
      return { kind: 'literal', value: Math.max(0, minimum) }
    }
    if (value.kind === 'literal') {
      return this.staticScalar(value, path, { minimum, maximum, focus: options.focus, integerLiteral: options.integer })
    }
    if (value.kind === 'token-expression') {
      return this.staticScalar(value, path, { minimum, maximum, focus: options.focus })
    }
    if (value.kind === 'number-binding') {
      this.keys(value, ['kind', 'bindingId', 'from', 'to', 'quantize'], path, options.focus)
      const bindingId = typeof value.bindingId === 'string' ? value.bindingId : ''
      if (!bindingId) this.finding('invalid-binding-reference', 'A binding ID is required.', `${path}.bindingId`, options.focus)
      const from = this.sourceVersion >= DISPLAY_DESIGN_VERSION_V3
        ? this.staticScalar(value.from, `${path}.from`, { focus: options.focus })
        : { kind: 'literal' as const, value: this.finiteNumber(value.from, `${path}.from`, Math.max(0, minimum), minimum, maximum, options.focus) }
      const to = this.sourceVersion >= DISPLAY_DESIGN_VERSION_V3
        ? this.staticScalar(value.to, `${path}.to`, { focus: options.focus })
        : { kind: 'literal' as const, value: this.finiteNumber(value.to, `${path}.to`, Math.max(0, minimum), minimum, maximum, options.focus) }
      let quantize: DisplayScalarQuantization = value.quantize === 'none' || value.quantize === 'integer' ? value.quantize : 'integer'
      if (value.quantize !== 'none' && value.quantize !== 'integer') this.finding('invalid-quantization', 'Quantization must be “none” or “integer”.', `${path}.quantize`, options.focus)
      if (options.integer && quantize !== 'integer') {
        this.finding('integer-quantization-required', 'This property requires integer quantization.', `${path}.quantize`, options.focus)
        quantize = 'integer'
      }
      return { kind: 'number-binding', bindingId, from, to, quantize }
    }
    this.keys(value, ['kind'], path, options.focus)
    this.finding('invalid-scalar-kind', 'Scalar kind must be “literal”, “token-expression”, or “number-binding”.', `${path}.kind`, options.focus)
    return { kind: 'literal', value: Math.max(0, minimum) }
  }

  visibility(value: unknown, path: string, focus?: DisplayDesignerFindingFocus): DisplayVisibility {
    if (!isRecord(value)) {
      this.finding('invalid-visibility', 'A visibility value is required.', path, focus)
      return { kind: 'visible' }
    }
    if (value.kind === 'visible') {
      this.keys(value, ['kind'], path, focus)
      return { kind: 'visible' }
    }
    if (value.kind === 'boolean-binding') {
      this.keys(value, ['kind', 'bindingId', 'invert'], path, focus)
      const bindingId = typeof value.bindingId === 'string' ? value.bindingId : ''
      if (!bindingId) this.finding('invalid-binding-reference', 'A binding ID is required.', `${path}.bindingId`, focus)
      return { kind: 'boolean-binding', bindingId, invert: this.boolean(value.invert, `${path}.invert`, false, focus) }
    }
    this.keys(value, ['kind'], path, focus)
    this.finding('invalid-visibility-kind', 'Visibility kind must be “visible” or “boolean-binding”.', `${path}.kind`, focus)
    return { kind: 'visible' }
  }

  text(value: unknown, path: string, focus?: DisplayDesignerFindingFocus): DisplayText {
    if (!isRecord(value)) {
      this.finding('invalid-text', 'A literal or text-binding value is required.', path, focus)
      return { kind: 'literal', value: '' }
    }
    if (value.kind === 'literal') {
      this.keys(value, ['kind', 'value'], path, focus)
      if (typeof value.value !== 'string' || codePointLength(value.value) > DISPLAY_DESIGN_LIMITS.maximumTextCodePoints) {
        this.finding('invalid-text', `Text must contain at most ${DISPLAY_DESIGN_LIMITS.maximumTextCodePoints} Unicode characters.`, `${path}.value`, focus)
        return { kind: 'literal', value: '' }
      }
      if (value.value.length === 0) this.finding('empty-text', 'Empty text does not draw visible glyphs.', `${path}.value`, focus, 'warning')
      return { kind: 'literal', value: value.value }
    }
    if (value.kind === 'text-binding') {
      this.keys(value, ['kind', 'bindingId'], path, focus)
      const bindingId = typeof value.bindingId === 'string' ? value.bindingId : ''
      if (!bindingId) this.finding('invalid-binding-reference', 'A binding ID is required.', `${path}.bindingId`, focus)
      return { kind: 'text-binding', bindingId }
    }
    this.keys(value, ['kind'], path, focus)
    this.finding('invalid-text-kind', 'Text kind must be “literal” or “text-binding”.', `${path}.kind`, focus)
    return { kind: 'literal', value: '' }
  }

  primitive(value: unknown, path: string, ownerFocus: DisplayDesignerFindingFocus, allowGroup: boolean): DisplayPrimitiveElement | undefined {
    if (!isRecord(value)) {
      this.finding('invalid-element', 'A primitive object is required.', path, ownerFocus)
      return undefined
    }
    if (value.kind === 'symbol-instance') {
      this.finding('nested-symbol-instance', 'Symbol variants may contain primitives only.', path, ownerFocus)
      return undefined
    }
    const id = this.id(value.id, `${path}.id`, ownerFocus)
    const focus = ownerFocus.primitiveId === undefined && ownerFocus.elementId === undefined
      ? ownerFocus
      : ownerFocus
    const baseFocus = { ...focus, ...(allowGroup ? { elementId: id } : { primitiveId: id }) }
    const name = this.name(value.name, `${path}.name`, 'Untitled element', baseFocus)
    const visible = this.visibility(value.visible, `${path}.visible`, { ...baseFocus, property: 'visible' })
    const groupId = allowGroup && typeof value.groupId === 'string' ? value.groupId : undefined
    const groupKey = allowGroup ? ['groupId'] : []
    if (allowGroup && value.groupId !== undefined && typeof value.groupId !== 'string') this.finding('invalid-group-reference', 'A group ID string is required.', `${path}.groupId`, baseFocus)
    if (value.kind === 'pixel-box') {
      this.keys(value, ['kind', 'id', 'name', 'visible', 'x', 'y', 'width', 'height', 'shades', ...groupKey], path, baseFocus)
      if (this.sourceVersion < DISPLAY_DESIGN_VERSION_V4) {
        this.finding('unsupported-element-version', 'Pixel boxes require display design version 4.', `${path}.kind`, baseFocus)
      }
      const integer = (candidate: unknown, property: string, fallback: number, minimum: number, maximum: number) => {
        const result = this.finiteNumber(candidate, `${path}.${property}`, fallback, minimum, maximum, { ...baseFocus, property })
        if (!Number.isInteger(result)) this.finding('integer-required', 'This property requires a whole number.', `${path}.${property}`, { ...baseFocus, property })
        return Math.round(result)
      }
      const x = this.scalar(value.x, `${path}.x`, { integer: true, focus: { ...baseFocus, property: 'x' } })
      const y = this.scalar(value.y, `${path}.y`, { integer: true, focus: { ...baseFocus, property: 'y' } })
      const width = integer(value.width, 'width', 1, 1, 256)
      const height = integer(value.height, 'height', 1, 1, 64)
      const rawShades = this.array(value.shades, `${path}.shades`)
      if (rawShades.length !== width * height) this.finding('pixel-box-size-mismatch', `Pixel box shades must contain exactly ${width * height} entries.`, `${path}.shades`, baseFocus)
      if (rawShades.length > DISPLAY_DESIGN_LIMITS.maximumPixelBoxPixels) this.finding('pixel-box-pixel-limit', `A pixel box may contain at most ${DISPLAY_DESIGN_LIMITS.maximumPixelBoxPixels} pixels.`, `${path}.shades`, baseFocus)
      const shades = rawShades.slice(0, DISPLAY_DESIGN_LIMITS.maximumPixelBoxPixels).map((candidate, index) => {
        if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 0 && candidate <= 15) return candidate
        this.finding('invalid-pixel-shade', 'Each pixel shade must be a whole number from 0 through 15.', `${path}.shades[${index}]`, { ...baseFocus, property: 'shades' })
        return 0
      })
      return { id, name, visible, ...(groupId ? { groupId } : {}), kind: 'pixel-box', x, y, width, height, shades }
    }
    const shade = this.scalar(value.shade, `${path}.shade`, { integer: true, minimum: 0, maximum: 15, focus: { ...baseFocus, property: 'shade' } })
    if (shade.kind === 'literal' && shade.value === 0) this.finding('shade-zero', 'Shade zero erases earlier pixels in draw order.', `${path}.shade`, { ...baseFocus, property: 'shade' }, 'warning')
    const shared = { id, name, shade, visible, ...(groupId ? { groupId } : {}) }
    if (value.kind === 'line') {
      this.keys(value, ['kind', 'id', 'name', 'shade', 'visible', 'smooth', 'x1', 'y1', 'x2', 'y2', ...groupKey], path, baseFocus)
      const smooth = this.boolean(value.smooth, `${path}.smooth`, false, baseFocus)
      if (smooth) this.finding('approximate-smoothing', 'Smooth primitive preview is an approximation of firmware antialiasing.', path, baseFocus, 'warning')
      const integer = !smooth
      return {
        ...shared, kind: 'line', smooth,
        x1: this.scalar(value.x1, `${path}.x1`, { integer, focus: { ...baseFocus, property: 'x1' } }),
        y1: this.scalar(value.y1, `${path}.y1`, { integer, focus: { ...baseFocus, property: 'y1' } }),
        x2: this.scalar(value.x2, `${path}.x2`, { integer, focus: { ...baseFocus, property: 'x2' } }),
        y2: this.scalar(value.y2, `${path}.y2`, { integer, focus: { ...baseFocus, property: 'y2' } }),
      }
    }
    if (value.kind === 'box') {
      this.keys(value, ['kind', 'id', 'name', 'shade', 'visible', 'fill', 'x1', 'y1', 'x2', 'y2', ...groupKey], path, baseFocus)
      return {
        ...shared, kind: 'box', fill: this.boolean(value.fill, `${path}.fill`, false, baseFocus),
        x1: this.scalar(value.x1, `${path}.x1`, { integer: true, focus: { ...baseFocus, property: 'x1' } }),
        y1: this.scalar(value.y1, `${path}.y1`, { integer: true, focus: { ...baseFocus, property: 'y1' } }),
        x2: this.scalar(value.x2, `${path}.x2`, { integer: true, focus: { ...baseFocus, property: 'x2' } }),
        y2: this.scalar(value.y2, `${path}.y2`, { integer: true, focus: { ...baseFocus, property: 'y2' } }),
      }
    }
    if (value.kind === 'circle') {
      this.keys(value, ['kind', 'id', 'name', 'shade', 'visible', 'smooth', 'x', 'y', 'radius', ...groupKey], path, baseFocus)
      const smooth = this.boolean(value.smooth, `${path}.smooth`, false, baseFocus)
      if (smooth) this.finding('approximate-smoothing', 'Smooth primitive preview is an approximation of firmware antialiasing.', path, baseFocus, 'warning')
      const integer = !smooth
      return {
        ...shared, kind: 'circle', smooth,
        x: this.scalar(value.x, `${path}.x`, { integer, focus: { ...baseFocus, property: 'x' } }),
        y: this.scalar(value.y, `${path}.y`, { integer, focus: { ...baseFocus, property: 'y' } }),
        radius: this.scalar(value.radius, `${path}.radius`, { integer, minimum: 0, maximum: DISPLAY_DESIGN_LIMITS.maximumRadius, focus: { ...baseFocus, property: 'radius' } }),
      }
    }
    if (value.kind === 'polygon') {
      this.keys(value, ['kind', 'id', 'name', 'shade', 'visible', 'x', 'y', 'radius', 'sides', ...groupKey], path, baseFocus)
      if (this.sourceVersion < DISPLAY_DESIGN_VERSION_V5) {
        this.finding('unsupported-element-version', 'Polygons require display design version 5.', `${path}.kind`, baseFocus)
      }
      const sides = this.finiteNumber(
        value.sides,
        `${path}.sides`,
        6,
        DISPLAY_DESIGN_LIMITS.minimumPolygonSides,
        DISPLAY_DESIGN_LIMITS.maximumPolygonSides,
        { ...baseFocus, property: 'sides' },
      )
      if (!Number.isInteger(sides)) {
        this.finding('integer-required', 'Polygon sides must be a whole number.', `${path}.sides`, { ...baseFocus, property: 'sides' })
      }
      return {
        ...shared, kind: 'polygon',
        x: this.scalar(value.x, `${path}.x`, { integer: true, focus: { ...baseFocus, property: 'x' } }),
        y: this.scalar(value.y, `${path}.y`, { integer: true, focus: { ...baseFocus, property: 'y' } }),
        radius: this.scalar(value.radius, `${path}.radius`, { integer: true, minimum: 0, maximum: DISPLAY_DESIGN_LIMITS.maximumRadius, focus: { ...baseFocus, property: 'radius' } }),
        sides: Math.round(sides),
      }
    }
    if (value.kind === 'bezier') {
      this.keys(value, ['kind', 'id', 'name', 'shade', 'visible', 'points', 'segments', ...groupKey], path, baseFocus)
      if (this.sourceVersion < DISPLAY_DESIGN_VERSION) {
        this.finding('unsupported-element-version', 'Bézier curves require display design version 6.', `${path}.kind`, baseFocus)
      }
      const rawPoints = this.array(value.points, `${path}.points`)
      if (rawPoints.length < DISPLAY_DESIGN_LIMITS.minimumBezierPoints || rawPoints.length > DISPLAY_DESIGN_LIMITS.maximumBezierPoints) {
        this.finding(
          'bezier-point-count',
          `A Bézier curve needs ${DISPLAY_DESIGN_LIMITS.minimumBezierPoints} through ${DISPLAY_DESIGN_LIMITS.maximumBezierPoints} control points.`,
          `${path}.points`,
          baseFocus,
        )
      }
      const points = rawPoints.slice(0, DISPLAY_DESIGN_LIMITS.maximumBezierPoints).flatMap((point, index) => {
        if (!isRecord(point)) {
          this.finding('invalid-bezier-point', 'Each Bézier control point needs X and Y coordinates.', `${path}.points[${index}]`, baseFocus)
          return []
        }
        this.keys(point, ['x', 'y'], `${path}.points[${index}]`, baseFocus)
        return [{
          x: this.scalar(point.x, `${path}.points[${index}].x`, { integer: true, focus: { ...baseFocus, property: `points[${index}].x` } }),
          y: this.scalar(point.y, `${path}.points[${index}].y`, { integer: true, focus: { ...baseFocus, property: `points[${index}].y` } }),
        }]
      })
      const segments = this.finiteNumber(
        value.segments,
        `${path}.segments`,
        24,
        DISPLAY_DESIGN_LIMITS.minimumBezierSegments,
        DISPLAY_DESIGN_LIMITS.maximumBezierSegments,
        { ...baseFocus, property: 'segments' },
      )
      if (!Number.isInteger(segments)) {
        this.finding('integer-required', 'Bézier detail must be a whole number of line segments.', `${path}.segments`, { ...baseFocus, property: 'segments' })
      }
      return { ...shared, kind: 'bezier', points, segments: Math.round(segments) }
    }
    if (value.kind === 'text') {
      this.keys(value, ['kind', 'id', 'name', 'shade', 'visible', 'tiny', 'x', 'y', 'text', 'align', ...groupKey], path, baseFocus)
      const align = value.align === 'left' || value.align === 'centre' || value.align === 'right' ? value.align : 'left'
      if (align !== value.align) this.finding('invalid-text-alignment', 'Text alignment must be “left”, “centre”, or “right”.', `${path}.align`, { ...baseFocus, property: 'align' })
      return {
        ...shared, kind: 'text', tiny: this.boolean(value.tiny, `${path}.tiny`, false, baseFocus),
        x: this.scalar(value.x, `${path}.x`, { integer: true, focus: { ...baseFocus, property: 'x' } }),
        y: this.scalar(value.y, `${path}.y`, { integer: true, focus: { ...baseFocus, property: 'y' } }),
        text: this.text(value.text, `${path}.text`, { ...baseFocus, property: 'text' }), align,
      }
    }
    this.keys(value, ['kind', 'id', 'name', 'shade', 'visible', ...groupKey], path, baseFocus)
    this.finding('invalid-element-kind', 'Element kind must be line, box, pixel-box, circle, polygon, bezier, or text.', `${path}.kind`, baseFocus)
    return undefined
  }

  group(value: unknown, path: string): DisplayDesignGroup | undefined {
    if (!isRecord(value)) {
      this.finding('invalid-group', 'A group object is required.', path)
      return undefined
    }
    this.keys(value, ['id', 'name'], path)
    const id = this.id(value.id, `${path}.id`)
    return { id, name: this.name(value.name, `${path}.name`, 'Untitled group', { groupId: id }) }
  }

  token(value: unknown, path: string): DisplayDesignToken | undefined {
    if (!isRecord(value)) {
      this.finding('invalid-token', 'A design token object is required.', path)
      return undefined
    }
    this.keys(value, ['id', 'name', 'luaName', 'value'], path)
    const id = this.id(value.id, `${path}.id`)
    const focus = { tokenId: id }
    return {
      id,
      name: this.name(value.name, `${path}.name`, 'Number token', focus),
      luaName: this.luaIdentifier(value.luaName, `${path}.luaName`, 'token', focus),
      value: this.finiteNumber(value.value, `${path}.value`, 0, DISPLAY_DESIGN_LIMITS.minimumCoordinate, DISPLAY_DESIGN_LIMITS.maximumCoordinate, focus),
    }
  }

  choice(value: unknown, path: string, bindingId: string): DisplayChoiceBindingChoice | undefined {
    if (!isRecord(value)) {
      this.finding('invalid-choice', 'A choice object is required.', path, { bindingId })
      return undefined
    }
    this.keys(value, ['id', 'name', 'luaValue'], path, { bindingId })
    const id = this.id(value.id, `${path}.id`, { bindingId })
    return {
      id,
      name: this.name(value.name, `${path}.name`, 'Untitled choice', { bindingId }),
      luaValue: this.stableValue(value.luaValue, `${path}.luaValue`, 'choice', { bindingId }),
    }
  }

  binding(value: unknown, path: string): DisplayDesignBinding | undefined {
    if (!isRecord(value)) {
      this.finding('invalid-binding', 'A binding object is required.', path)
      return undefined
    }
    const id = this.id(value.id, `${path}.id`)
    const focus = { bindingId: id }
    const common = {
      id,
      name: this.name(value.name, `${path}.name`, 'Untitled binding', focus),
      luaName: this.luaIdentifier(value.luaName, `${path}.luaName`, 'value', focus),
    }
    if (value.kind === 'number') {
      this.keys(value, ['kind', 'id', 'name', 'luaName', 'previewValue'], path, focus)
      return { kind: 'number', ...common, previewValue: this.finiteNumber(value.previewValue, `${path}.previewValue`, 0.5, 0, 1, focus) }
    }
    if (value.kind === 'boolean') {
      this.keys(value, ['kind', 'id', 'name', 'luaName', 'previewValue'], path, focus)
      return { kind: 'boolean', ...common, previewValue: this.boolean(value.previewValue, `${path}.previewValue`, false, focus) }
    }
    if (value.kind === 'text') {
      this.keys(value, ['kind', 'id', 'name', 'luaName', 'previewValue'], path, focus)
      const previewValue = typeof value.previewValue === 'string' && codePointLength(value.previewValue) <= DISPLAY_DESIGN_LIMITS.maximumTextCodePoints
        ? value.previewValue
        : ''
      if (previewValue !== value.previewValue) this.finding('invalid-text', `Text must contain at most ${DISPLAY_DESIGN_LIMITS.maximumTextCodePoints} Unicode characters.`, `${path}.previewValue`, focus)
      return { kind: 'text', ...common, previewValue }
    }
    if (value.kind === 'choice') {
      this.keys(value, ['kind', 'id', 'name', 'luaName', 'choices', 'previewChoiceId'], path, focus)
      const choices = this.array(value.choices, `${path}.choices`).flatMap((choice, index) => {
        const normalized = this.choice(choice, `${path}.choices[${index}]`, id)
        return normalized ? [normalized] : []
      })
      if (choices.length === 0) this.finding('empty-choice-binding', 'Choice bindings need at least one choice.', `${path}.choices`, focus)
      const previewChoiceId = typeof value.previewChoiceId === 'string' ? value.previewChoiceId : ''
      return { kind: 'choice', ...common, choices, previewChoiceId }
    }
    this.keys(value, ['kind', 'id', 'name', 'luaName'], path, focus)
    this.finding('invalid-binding-kind', 'Binding kind must be number, boolean, text, or choice.', `${path}.kind`, focus)
    return undefined
  }

  variant(value: unknown, path: string, symbolId: string): DisplaySymbolVariant | undefined {
    if (!isRecord(value)) {
      this.finding('invalid-variant', 'A symbol state object is required.', path, { symbolId })
      return undefined
    }
    this.keys(value, ['id', 'name', 'luaValue', 'elements'], path, { symbolId })
    const id = this.id(value.id, `${path}.id`, { symbolId })
    const focus = { symbolId, variantId: id }
    const elements = this.array(value.elements, `${path}.elements`).flatMap((element, index) => {
      const primitive = this.primitive(element, `${path}.elements[${index}]`, focus, false)
      return primitive ? [primitive] : []
    })
    return {
      id,
      name: this.name(value.name, `${path}.name`, 'Default', focus),
      luaValue: this.stableValue(value.luaValue, `${path}.luaValue`, 'default', focus),
      elements,
    }
  }

  symbol(value: unknown, path: string): DisplayDesignSymbol | undefined {
    if (!isRecord(value)) {
      this.finding('invalid-symbol', 'A symbol object is required.', path)
      return undefined
    }
    this.keys(value, ['id', 'name', 'luaName', 'defaultVariantId', 'variants'], path)
    const id = this.id(value.id, `${path}.id`)
    const focus = { symbolId: id }
    const rawVariants = this.array(value.variants, `${path}.variants`)
    if (rawVariants.length > DISPLAY_DESIGN_LIMITS.maximumVariantsPerSymbol) {
      this.finding('variant-limit', `A symbol may contain at most ${DISPLAY_DESIGN_LIMITS.maximumVariantsPerSymbol} states.`, `${path}.variants`, focus)
    }
    const variants = rawVariants.flatMap((variant, index) => {
      const normalized = this.variant(variant, `${path}.variants[${index}]`, id)
      return normalized ? [normalized] : []
    })
    if (variants.length === 0) this.finding('empty-symbol', 'A symbol needs at least one state.', `${path}.variants`, focus)
    const requestedDefault = typeof value.defaultVariantId === 'string' ? value.defaultVariantId : ''
    const defaultVariantId = variants.some(({ id: variantId }) => variantId === requestedDefault)
      ? requestedDefault
      : variants[0]?.id ?? requestedDefault
    if (requestedDefault !== defaultVariantId || !requestedDefault) {
      this.finding('invalid-default-variant', 'The default state must reference one of the symbol states.', `${path}.defaultVariantId`, focus)
    }
    return {
      id,
      name: this.name(value.name, `${path}.name`, 'Untitled symbol', focus),
      luaName: this.luaIdentifier(value.luaName, `${path}.luaName`, 'draw_symbol', focus),
      defaultVariantId,
      variants,
    }
  }

  state(value: unknown, path: string, elementId: string): DisplaySymbolState {
    const focus = { elementId, property: 'state' }
    if (!isRecord(value)) {
      this.finding('invalid-symbol-state', 'A literal or choice-bound state is required.', path, focus)
      return { kind: 'literal', variantId: '' }
    }
    if (value.kind === 'literal') {
      this.keys(value, ['kind', 'variantId'], path, focus)
      const variantId = typeof value.variantId === 'string' ? value.variantId : ''
      if (!variantId) this.finding('invalid-variant-reference', 'A state ID is required.', `${path}.variantId`, focus)
      return { kind: 'literal', variantId }
    }
    if (value.kind === 'choice-binding') {
      this.keys(value, ['kind', 'bindingId', 'variantByChoiceId'], path, focus)
      const bindingId = typeof value.bindingId === 'string' ? value.bindingId : ''
      if (!bindingId) this.finding('invalid-binding-reference', 'A binding ID is required.', `${path}.bindingId`, focus)
      const mappingEntries: Array<[string, string]> = []
      if (!isRecord(value.variantByChoiceId)) {
        this.finding('invalid-choice-map', 'A choice-to-state mapping object is required.', `${path}.variantByChoiceId`, focus)
      } else {
        for (const choiceId of Object.keys(value.variantByChoiceId).sort()) {
          const variantId = value.variantByChoiceId[choiceId]
          if (typeof variantId !== 'string') this.finding('invalid-variant-reference', 'Each mapped state must be an ID string.', `${path}.variantByChoiceId.${choiceId}`, focus)
          else mappingEntries.push([choiceId, variantId])
        }
      }
      const variantByChoiceId = Object.fromEntries(mappingEntries)
      return { kind: 'choice-binding', bindingId, variantByChoiceId }
    }
    this.keys(value, ['kind'], path, focus)
    this.finding('invalid-symbol-state-kind', 'Symbol state kind must be “literal” or “choice-binding”.', `${path}.kind`, focus)
    return { kind: 'literal', variantId: '' }
  }

  element(value: unknown, path: string): DisplayDesignElement | undefined {
    if (isRecord(value) && value.kind === 'symbol-instance') {
      this.keys(value, ['kind', 'id', 'name', 'groupId', 'symbolId', 'x', 'y', 'visible', 'state'], path)
      const id = this.id(value.id, `${path}.id`)
      const focus = { elementId: id }
      const groupId = typeof value.groupId === 'string' ? value.groupId : undefined
      if (value.groupId !== undefined && !groupId) this.finding('invalid-group-reference', 'A group ID string is required.', `${path}.groupId`, focus)
      const symbolId = typeof value.symbolId === 'string' ? value.symbolId : ''
      if (!symbolId) this.finding('invalid-symbol-reference', 'A symbol ID is required.', `${path}.symbolId`, focus)
      return {
        kind: 'symbol-instance', id,
        name: this.name(value.name, `${path}.name`, 'Symbol instance', focus),
        ...(groupId ? { groupId } : {}), symbolId,
        x: this.scalar(value.x, `${path}.x`, { integer: false, focus: { ...focus, property: 'x' } }),
        y: this.scalar(value.y, `${path}.y`, { integer: false, focus: { ...focus, property: 'y' } }),
        visible: this.visibility(value.visible, `${path}.visible`, { ...focus, property: 'visible' }),
        state: this.state(value.state, `${path}.state`, id),
      }
    }
    return this.primitive(value, path, {}, true)
  }
}

function addDuplicateValues(
  validator: Validator,
  values: Array<{ value: string; path: string; focus?: DisplayDesignerFindingFocus }>,
  ruleId: string,
  label: string,
): void {
  const seen = new Set<string>()
  for (const entry of values) {
    if (seen.has(entry.value)) validator.finding(ruleId, `${label} “${entry.value}” is duplicated.`, entry.path, entry.focus)
    else seen.add(entry.value)
  }
}

function checkScalarReference(
  validator: Validator,
  scalar: DisplayScalar,
  path: string,
  bindings: Map<string, DisplayDesignBinding>,
  tokens: Map<string, DisplayDesignToken>,
  focus: DisplayDesignerFindingFocus,
  options: { minimum?: number; maximum?: number } = {},
): void {
  const staticScalars = scalar.kind === 'number-binding' ? [scalar.from, scalar.to] : [scalar]
  for (const [index, staticScalar] of staticScalars.entries()) {
    if (staticScalar.kind !== 'token-expression') continue
    for (const tokenId of collectDisplayTokenExpressionReferences(staticScalar.expression)) {
      if (!tokens.has(tokenId)) {
        const endpoint = scalar.kind === 'number-binding' ? (index === 0 ? '.from' : '.to') : ''
        validator.finding('dangling-token', 'This formula references a missing design token.', `${path}${endpoint}.expression`, { ...focus, tokenId })
      }
    }
  }
  if (scalar.kind === 'number-binding' && bindings.get(scalar.bindingId)?.kind !== 'number') {
    validator.finding('dangling-number-binding', 'This property must reference an existing number binding.', `${path}.bindingId`, focus)
  }
  try {
    const resolved = resolveDisplayScalar(scalar, createDisplayBindingMap([...bindings.values()]), createDisplayTokenMap([...tokens.values()]))
    const minimum = options.minimum ?? DISPLAY_DESIGN_LIMITS.minimumCoordinate
    const maximum = options.maximum ?? DISPLAY_DESIGN_LIMITS.maximumCoordinate
    if (!Number.isFinite(resolved) || resolved < minimum || resolved > maximum) {
      validator.finding('resolved-scalar-domain', `The resolved property must be finite and from ${minimum} through ${maximum}.`, path, focus)
    }
  } catch (error) {
    validator.finding('invalid-token-result', error instanceof Error ? error.message : 'The formula could not be resolved.', path, focus)
  }
}

function checkVisibilityReference(
  validator: Validator,
  visibility: DisplayVisibility,
  path: string,
  bindings: Map<string, DisplayDesignBinding>,
  focus: DisplayDesignerFindingFocus,
): void {
  if (visibility.kind !== 'boolean-binding') return
  if (bindings.get(visibility.bindingId)?.kind !== 'boolean') {
    validator.finding('dangling-boolean-binding', 'Visibility must reference an existing boolean binding.', `${path}.bindingId`, focus)
  }
}

function checkPrimitiveReferences(
  validator: Validator,
  primitive: DisplayPrimitiveElement,
  path: string,
  bindings: Map<string, DisplayDesignBinding>,
  tokens: Map<string, DisplayDesignToken>,
  focus: DisplayDesignerFindingFocus,
): void {
  checkVisibilityReference(validator, primitive.visible, `${path}.visible`, bindings, { ...focus, property: 'visible' })
  if (primitive.kind === 'pixel-box') {
    checkScalarReference(validator, primitive.x, `${path}.x`, bindings, tokens, { ...focus, property: 'x' })
    checkScalarReference(validator, primitive.y, `${path}.y`, bindings, tokens, { ...focus, property: 'y' })
    return
  }
  checkScalarReference(validator, primitive.shade, `${path}.shade`, bindings, tokens, { ...focus, property: 'shade' })
  if (primitive.kind === 'line' || primitive.kind === 'box') {
    for (const property of ['x1', 'y1', 'x2', 'y2'] as const) checkScalarReference(validator, primitive[property], `${path}.${property}`, bindings, tokens, { ...focus, property })
  } else if (primitive.kind === 'circle' || primitive.kind === 'polygon') {
    for (const property of ['x', 'y'] as const) checkScalarReference(validator, primitive[property], `${path}.${property}`, bindings, tokens, { ...focus, property })
    checkScalarReference(validator, primitive.radius, `${path}.radius`, bindings, tokens, { ...focus, property: 'radius' }, { minimum: 0, maximum: DISPLAY_DESIGN_LIMITS.maximumRadius })
  } else if (primitive.kind === 'bezier') {
    for (const [index, point] of primitive.points.entries()) {
      checkScalarReference(validator, point.x, `${path}.points[${index}].x`, bindings, tokens, { ...focus, property: `points[${index}].x` })
      checkScalarReference(validator, point.y, `${path}.points[${index}].y`, bindings, tokens, { ...focus, property: `points[${index}].y` })
    }
  } else {
    checkScalarReference(validator, primitive.x, `${path}.x`, bindings, tokens, { ...focus, property: 'x' })
    checkScalarReference(validator, primitive.y, `${path}.y`, bindings, tokens, { ...focus, property: 'y' })
    if (primitive.text.kind === 'text-binding' && bindings.get(primitive.text.bindingId)?.kind !== 'text') {
      validator.finding('dangling-text-binding', 'Text must reference an existing text binding.', `${path}.text.bindingId`, { ...focus, property: 'text' })
    }
  }
}

function crossValidate(validator: Validator, document: DisplayDesignDocument): void {
  const groups = new Set(document.groups.map(({ id }) => id))
  const bindings = new Map(document.bindings.map((binding) => [binding.id, binding]))
  const tokens = new Map(document.tokens.map((token) => [token.id, token]))
  const symbols = new Map(document.symbols.map((symbol) => [symbol.id, symbol]))

  addDuplicateValues(validator, [
    ...document.tokens.map((token, index) => ({ value: token.luaName, path: `tokens[${index}].luaName`, focus: { tokenId: token.id } })),
    ...document.bindings.map((binding, index) => ({ value: binding.luaName, path: `bindings[${index}].luaName`, focus: { bindingId: binding.id } })),
    ...document.symbols.map((symbol, index) => ({ value: symbol.luaName, path: `symbols[${index}].luaName`, focus: { symbolId: symbol.id } })),
  ], 'duplicate-lua-name', 'Generated Lua name')

  for (const [bindingIndex, binding] of document.bindings.entries()) {
    if (binding.kind !== 'choice') continue
    addDuplicateValues(validator, binding.choices.map((choice, choiceIndex) => ({ value: choice.luaValue, path: `bindings[${bindingIndex}].choices[${choiceIndex}].luaValue`, focus: { bindingId: binding.id } })), 'duplicate-choice-lua-value', 'Choice Lua value')
    if (!binding.choices.some(({ id }) => id === binding.previewChoiceId)) {
      validator.finding('invalid-preview-choice', 'The preview must reference one of this binding’s choices.', `bindings[${bindingIndex}].previewChoiceId`, { bindingId: binding.id })
    }
  }

  for (const [symbolIndex, symbol] of document.symbols.entries()) {
    addDuplicateValues(validator, symbol.variants.map((variant, variantIndex) => ({ value: variant.luaValue, path: `symbols[${symbolIndex}].variants[${variantIndex}].luaValue`, focus: { symbolId: symbol.id, variantId: variant.id } })), 'duplicate-variant-lua-value', 'State Lua value')
    for (const [variantIndex, variant] of symbol.variants.entries()) {
      for (const [primitiveIndex, primitive] of variant.elements.entries()) {
        checkPrimitiveReferences(validator, primitive, `symbols[${symbolIndex}].variants[${variantIndex}].elements[${primitiveIndex}]`, bindings, tokens, { symbolId: symbol.id, variantId: variant.id, primitiveId: primitive.id })
      }
    }
  }

  for (const [elementIndex, element] of document.elements.entries()) {
    const path = `elements[${elementIndex}]`
    if (element.groupId && !groups.has(element.groupId)) validator.finding('dangling-group', 'The element references a missing group.', `${path}.groupId`, { elementId: element.id, property: 'groupId' })
    if (element.kind !== 'symbol-instance') {
      checkPrimitiveReferences(validator, element, path, bindings, tokens, { elementId: element.id })
      continue
    }
    checkScalarReference(validator, element.x, `${path}.x`, bindings, tokens, { elementId: element.id, property: 'x' })
    checkScalarReference(validator, element.y, `${path}.y`, bindings, tokens, { elementId: element.id, property: 'y' })
    checkVisibilityReference(validator, element.visible, `${path}.visible`, bindings, { elementId: element.id, property: 'visible' })
    const symbol = symbols.get(element.symbolId)
    if (!symbol) {
      validator.finding('dangling-symbol', 'The instance references a missing symbol.', `${path}.symbolId`, { elementId: element.id, property: 'symbolId' })
      continue
    }
    const variantIds = new Set(symbol.variants.map(({ id }) => id))
    if (element.state.kind === 'literal') {
      if (!variantIds.has(element.state.variantId)) validator.finding('dangling-variant', 'The instance references a missing symbol state.', `${path}.state.variantId`, { elementId: element.id, property: 'state' })
      continue
    }
    const binding = bindings.get(element.state.bindingId)
    if (binding?.kind !== 'choice') {
      validator.finding('dangling-choice-binding', 'Dynamic symbol state must reference an existing choice binding.', `${path}.state.bindingId`, { elementId: element.id, property: 'state' })
      continue
    }
    const choiceIds = new Set(binding.choices.map(({ id }) => id))
    for (const choice of binding.choices) {
      const variantId = element.state.variantByChoiceId[choice.id]
      if (!variantId || !variantIds.has(variantId)) validator.finding('incomplete-choice-map', `Choice “${choice.name}” must map to a state in this symbol.`, `${path}.state.variantByChoiceId.${choice.id}`, { elementId: element.id, property: 'state' })
    }
    for (const choiceId of Object.keys(element.state.variantByChoiceId)) {
      if (!choiceIds.has(choiceId)) validator.finding('unknown-choice-map-entry', `The state map contains unknown choice ID “${choiceId}”.`, `${path}.state.variantByChoiceId.${choiceId}`, { elementId: element.id, property: 'state' })
    }
  }

  const usedTokenIds = new Set(listDisplayTokenUsages(document).map(({ tokenId }) => tokenId))
  for (const [index, token] of document.tokens.entries()) {
    if (!usedTokenIds.has(token.id)) {
      validator.finding('unused-token', `Design token “${token.name}” is not used.`, `tokens[${index}]`, { tokenId: token.id }, 'warning')
    }
  }
}

export function validateDisplayDesign(value: unknown): DisplayDesignValidationResult {
  const sourceVersion = isRecord(value) && (value.version === DISPLAY_DESIGN_VERSION_V1 || value.version === DISPLAY_DESIGN_VERSION_V2 || value.version === DISPLAY_DESIGN_VERSION_V3 || value.version === DISPLAY_DESIGN_VERSION_V4 || value.version === DISPLAY_DESIGN_VERSION_V5 || value.version === DISPLAY_DESIGN_VERSION)
    ? value.version
    : DISPLAY_DESIGN_VERSION
  const validator = new Validator(sourceVersion)
  try {
    if (!isRecord(value)) {
      validator.finding('invalid-document', 'A display design object is required.', '$')
      return { ok: false, findings: validator.findings }
    }
    if (value.kind !== DISPLAY_DESIGN_KIND) {
      validator.finding('invalid-kind', `Document kind must be “${DISPLAY_DESIGN_KIND}”.`, '$.kind')
      return { ok: false, findings: validator.findings }
    }
    if (value.version !== DISPLAY_DESIGN_VERSION_V1 && value.version !== DISPLAY_DESIGN_VERSION_V2 && value.version !== DISPLAY_DESIGN_VERSION_V3 && value.version !== DISPLAY_DESIGN_VERSION_V4 && value.version !== DISPLAY_DESIGN_VERSION_V5 && value.version !== DISPLAY_DESIGN_VERSION) {
      validator.finding('unsupported-version', `Only display design versions ${DISPLAY_DESIGN_VERSION_V1} through ${DISPLAY_DESIGN_VERSION} are supported.`, '$.version')
      return { ok: false, findings: validator.findings }
    }
    const isVersion1 = value.version === DISPLAY_DESIGN_VERSION_V1
    const hasTokens = value.version === DISPLAY_DESIGN_VERSION_V3 || value.version === DISPLAY_DESIGN_VERSION_V4 || value.version === DISPLAY_DESIGN_VERSION_V5 || value.version === DISPLAY_DESIGN_VERSION
    validator.keys(
      value,
      isVersion1
        ? ['kind', 'version', 'name', 'displayMode', 'elements', 'groups', 'bindings', 'symbols']
        : hasTokens
          ? ['kind', 'version', 'name', 'displayMode', 'elements', 'groups', 'tokens', 'bindings', 'symbols', 'layoutGrid']
          : ['kind', 'version', 'name', 'displayMode', 'elements', 'groups', 'bindings', 'symbols', 'layoutGrid'],
      '$',
    )
    const layoutGrid = isVersion1 ? null : validateLayoutGrid(validator, value.layoutGrid)

    const rawGroups = validator.array(value.groups, 'groups')
    const rawTokens = hasTokens ? validator.array(value.tokens, 'tokens') : []
    const rawBindings = validator.array(value.bindings, 'bindings')
    const rawSymbols = validator.array(value.symbols, 'symbols')
    const rawElements = validator.array(value.elements, 'elements')
    if (rawGroups.length > DISPLAY_DESIGN_LIMITS.maximumGroups) validator.finding('group-limit', `A design may contain at most ${DISPLAY_DESIGN_LIMITS.maximumGroups} groups.`, 'groups')
    if (rawTokens.length > DISPLAY_DESIGN_LIMITS.maximumTokens) validator.finding('token-limit', `A design may contain at most ${DISPLAY_DESIGN_LIMITS.maximumTokens} tokens.`, 'tokens')
    if (rawBindings.length > DISPLAY_DESIGN_LIMITS.maximumBindings) validator.finding('binding-limit', `A design may contain at most ${DISPLAY_DESIGN_LIMITS.maximumBindings} bindings.`, 'bindings')
    if (rawSymbols.length > DISPLAY_DESIGN_LIMITS.maximumSymbols) validator.finding('symbol-limit', `A design may contain at most ${DISPLAY_DESIGN_LIMITS.maximumSymbols} symbols.`, 'symbols')

    const groups = rawGroups.flatMap((group, index) => {
      const normalized = validator.group(group, `groups[${index}]`)
      return normalized ? [normalized] : []
    })
    const tokens = rawTokens.flatMap((token, index) => {
      const normalized = validator.token(token, `tokens[${index}]`)
      return normalized ? [normalized] : []
    })
    const bindings = rawBindings.flatMap((binding, index) => {
      const normalized = validator.binding(binding, `bindings[${index}]`)
      return normalized ? [normalized] : []
    })
    const symbols = rawSymbols.flatMap((symbol, index) => {
      const normalized = validator.symbol(symbol, `symbols[${index}]`)
      return normalized ? [normalized] : []
    })
    const elements = rawElements.flatMap((element, index) => {
      const normalized = validator.element(element, `elements[${index}]`)
      return normalized ? [normalized] : []
    })

    const primitiveCount = elements.filter(({ kind }) => kind !== 'symbol-instance').length
      + symbols.reduce((count, symbol) => count + symbol.variants.reduce((variantCount, variant) => variantCount + variant.elements.length, 0), 0)
    const instanceCount = elements.filter(({ kind }) => kind === 'symbol-instance').length
    if (primitiveCount > DISPLAY_DESIGN_LIMITS.maximumPrimitives) validator.finding('primitive-limit', `A design may store at most ${DISPLAY_DESIGN_LIMITS.maximumPrimitives} primitives.`, 'elements')
    if (instanceCount > DISPLAY_DESIGN_LIMITS.maximumInstances) validator.finding('instance-limit', `A design may contain at most ${DISPLAY_DESIGN_LIMITS.maximumInstances} symbol instances.`, 'elements')

    const displayMode = value.displayMode === 'parameter-line' || value.displayMode === 'full-screen'
      ? value.displayMode
      : 'parameter-line'
    if (displayMode !== value.displayMode) validator.finding('invalid-display-mode', 'Display mode must be “parameter-line” or “full-screen”.', 'displayMode')
    const document: DisplayDesignDocument = {
      kind: DISPLAY_DESIGN_KIND,
      version: DISPLAY_DESIGN_VERSION,
      name: validator.name(value.name, 'name', 'Untitled display'),
      displayMode,
      elements,
      groups,
      tokens,
      bindings,
      symbols,
      layoutGrid,
    }
    crossValidate(validator, document)
    return {
      ok: validator.findings.every(({ severity }) => severity !== 'error'),
      document,
      findings: validator.findings,
    }
  } catch {
    validator.finding('malformed-document', 'The display design could not be inspected safely.', '$')
    return { ok: false, findings: validator.findings }
  }
}
