import {
  DISPLAY_DESIGN_KIND,
  DISPLAY_DESIGN_LIMITS,
  DISPLAY_DESIGN_VERSION,
  type DisplayChoiceBindingChoice,
  type DisplayDesignBinding,
  type DisplayDesignDocumentV1,
  type DisplayDesignerFinding,
  type DisplayDesignerFindingFocus,
  type DisplayDesignElement,
  type DisplayDesignGroup,
  type DisplayDesignSymbol,
  type DisplayPrimitiveElement,
  type DisplayScalar,
  type DisplayScalarQuantization,
  type DisplaySymbolState,
  type DisplaySymbolVariant,
  type DisplayText,
  type DisplayVisibility,
} from './display-design-model'

export interface DisplayDesignValidationResult {
  ok: boolean
  document?: DisplayDesignDocumentV1
  findings: DisplayDesignerFinding[]
}

type RecordValue = Record<string, unknown>

const LUA_KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto',
  'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while',
])

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function codePointLength(value: string): number {
  return [...value].length
}

class Validator {
  readonly findings: DisplayDesignerFinding[] = []
  readonly ids = new Map<string, string>()

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
    if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value) || LUA_KEYWORDS.has(value)) {
      this.finding('invalid-lua-identifier', 'A non-keyword Lua identifier is required.', path, focus)
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

  scalar(
    value: unknown,
    path: string,
    options: { integer: boolean; minimum?: number; maximum?: number; focus?: DisplayDesignerFindingFocus },
  ): DisplayScalar {
    const minimum = options.minimum ?? DISPLAY_DESIGN_LIMITS.minimumCoordinate
    const maximum = options.maximum ?? DISPLAY_DESIGN_LIMITS.maximumCoordinate
    if (!isRecord(value)) {
      this.finding('invalid-scalar', 'A literal or number-binding scalar is required.', path, options.focus)
      return { kind: 'literal', value: Math.max(0, minimum) }
    }
    if (value.kind === 'literal') {
      this.keys(value, ['kind', 'value'], path, options.focus)
      const number = this.finiteNumber(value.value, `${path}.value`, Math.max(0, minimum), minimum, maximum, { ...options.focus, property: options.focus?.property })
      if (options.integer && !Number.isInteger(number)) {
        this.finding('integer-required', 'This property requires a whole number.', `${path}.value`, options.focus)
        return { kind: 'literal', value: Math.round(number) }
      }
      return { kind: 'literal', value: number }
    }
    if (value.kind === 'number-binding') {
      this.keys(value, ['kind', 'bindingId', 'from', 'to', 'quantize'], path, options.focus)
      const bindingId = typeof value.bindingId === 'string' ? value.bindingId : ''
      if (!bindingId) this.finding('invalid-binding-reference', 'A binding ID is required.', `${path}.bindingId`, options.focus)
      const from = this.finiteNumber(value.from, `${path}.from`, Math.max(0, minimum), minimum, maximum, options.focus)
      const to = this.finiteNumber(value.to, `${path}.to`, Math.max(0, minimum), minimum, maximum, options.focus)
      let quantize: DisplayScalarQuantization = value.quantize === 'none' || value.quantize === 'integer' ? value.quantize : 'integer'
      if (value.quantize !== 'none' && value.quantize !== 'integer') this.finding('invalid-quantization', 'Quantization must be “none” or “integer”.', `${path}.quantize`, options.focus)
      if (options.integer && quantize !== 'integer') {
        this.finding('integer-quantization-required', 'This property requires integer quantization.', `${path}.quantize`, options.focus)
        quantize = 'integer'
      }
      return { kind: 'number-binding', bindingId, from, to, quantize }
    }
    this.keys(value, ['kind'], path, options.focus)
    this.finding('invalid-scalar-kind', 'Scalar kind must be “literal” or “number-binding”.', `${path}.kind`, options.focus)
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
    const shade = this.scalar(value.shade, `${path}.shade`, { integer: true, minimum: 0, maximum: 15, focus: { ...baseFocus, property: 'shade' } })
    const visible = this.visibility(value.visible, `${path}.visible`, { ...baseFocus, property: 'visible' })
    const groupId = allowGroup && typeof value.groupId === 'string' ? value.groupId : undefined
    const groupKey = allowGroup ? ['groupId'] : []
    if (allowGroup && value.groupId !== undefined && typeof value.groupId !== 'string') this.finding('invalid-group-reference', 'A group ID string is required.', `${path}.groupId`, baseFocus)
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
    this.finding('invalid-element-kind', 'Element kind must be line, box, circle, or text.', `${path}.kind`, baseFocus)
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
  focus: DisplayDesignerFindingFocus,
): void {
  if (scalar.kind !== 'number-binding') return
  if (bindings.get(scalar.bindingId)?.kind !== 'number') {
    validator.finding('dangling-number-binding', 'This property must reference an existing number binding.', `${path}.bindingId`, focus)
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
  focus: DisplayDesignerFindingFocus,
): void {
  checkScalarReference(validator, primitive.shade, `${path}.shade`, bindings, { ...focus, property: 'shade' })
  checkVisibilityReference(validator, primitive.visible, `${path}.visible`, bindings, { ...focus, property: 'visible' })
  if (primitive.kind === 'line' || primitive.kind === 'box') {
    for (const property of ['x1', 'y1', 'x2', 'y2'] as const) checkScalarReference(validator, primitive[property], `${path}.${property}`, bindings, { ...focus, property })
  } else if (primitive.kind === 'circle') {
    for (const property of ['x', 'y', 'radius'] as const) checkScalarReference(validator, primitive[property], `${path}.${property}`, bindings, { ...focus, property })
  } else {
    checkScalarReference(validator, primitive.x, `${path}.x`, bindings, { ...focus, property: 'x' })
    checkScalarReference(validator, primitive.y, `${path}.y`, bindings, { ...focus, property: 'y' })
    if (primitive.text.kind === 'text-binding' && bindings.get(primitive.text.bindingId)?.kind !== 'text') {
      validator.finding('dangling-text-binding', 'Text must reference an existing text binding.', `${path}.text.bindingId`, { ...focus, property: 'text' })
    }
  }
}

function crossValidate(validator: Validator, document: DisplayDesignDocumentV1): void {
  const groups = new Set(document.groups.map(({ id }) => id))
  const bindings = new Map(document.bindings.map((binding) => [binding.id, binding]))
  const symbols = new Map(document.symbols.map((symbol) => [symbol.id, symbol]))

  addDuplicateValues(validator, document.bindings.map((binding, index) => ({ value: binding.luaName, path: `bindings[${index}].luaName`, focus: { bindingId: binding.id } })), 'duplicate-lua-name', 'Binding Lua name')
  addDuplicateValues(validator, document.symbols.map((symbol, index) => ({ value: symbol.luaName, path: `symbols[${index}].luaName`, focus: { symbolId: symbol.id } })), 'duplicate-lua-name', 'Symbol Lua name')

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
        checkPrimitiveReferences(validator, primitive, `symbols[${symbolIndex}].variants[${variantIndex}].elements[${primitiveIndex}]`, bindings, { symbolId: symbol.id, variantId: variant.id, primitiveId: primitive.id })
      }
    }
  }

  for (const [elementIndex, element] of document.elements.entries()) {
    const path = `elements[${elementIndex}]`
    if (element.groupId && !groups.has(element.groupId)) validator.finding('dangling-group', 'The element references a missing group.', `${path}.groupId`, { elementId: element.id, property: 'groupId' })
    if (element.kind !== 'symbol-instance') {
      checkPrimitiveReferences(validator, element, path, bindings, { elementId: element.id })
      continue
    }
    checkScalarReference(validator, element.x, `${path}.x`, bindings, { elementId: element.id, property: 'x' })
    checkScalarReference(validator, element.y, `${path}.y`, bindings, { elementId: element.id, property: 'y' })
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
}

export function validateDisplayDesign(value: unknown): DisplayDesignValidationResult {
  const validator = new Validator()
  try {
    if (!isRecord(value)) {
      validator.finding('invalid-document', 'A display design object is required.', '$')
      return { ok: false, findings: validator.findings }
    }
    validator.keys(value, ['kind', 'version', 'name', 'displayMode', 'elements', 'groups', 'bindings', 'symbols'], '$')
    if (value.kind !== DISPLAY_DESIGN_KIND) {
      validator.finding('invalid-kind', `Document kind must be “${DISPLAY_DESIGN_KIND}”.`, '$.kind')
      return { ok: false, findings: validator.findings }
    }
    if (value.version !== DISPLAY_DESIGN_VERSION) {
      validator.finding('unsupported-version', `Only display design version ${DISPLAY_DESIGN_VERSION} is supported.`, '$.version')
      return { ok: false, findings: validator.findings }
    }

    const rawGroups = validator.array(value.groups, 'groups')
    const rawBindings = validator.array(value.bindings, 'bindings')
    const rawSymbols = validator.array(value.symbols, 'symbols')
    const rawElements = validator.array(value.elements, 'elements')
    if (rawGroups.length > DISPLAY_DESIGN_LIMITS.maximumGroups) validator.finding('group-limit', `A design may contain at most ${DISPLAY_DESIGN_LIMITS.maximumGroups} groups.`, 'groups')
    if (rawBindings.length > DISPLAY_DESIGN_LIMITS.maximumBindings) validator.finding('binding-limit', `A design may contain at most ${DISPLAY_DESIGN_LIMITS.maximumBindings} bindings.`, 'bindings')
    if (rawSymbols.length > DISPLAY_DESIGN_LIMITS.maximumSymbols) validator.finding('symbol-limit', `A design may contain at most ${DISPLAY_DESIGN_LIMITS.maximumSymbols} symbols.`, 'symbols')

    const groups = rawGroups.flatMap((group, index) => {
      const normalized = validator.group(group, `groups[${index}]`)
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
    const document: DisplayDesignDocumentV1 = {
      kind: DISPLAY_DESIGN_KIND,
      version: DISPLAY_DESIGN_VERSION,
      name: validator.name(value.name, 'name', 'Untitled display'),
      displayMode,
      elements,
      groups,
      bindings,
      symbols,
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
