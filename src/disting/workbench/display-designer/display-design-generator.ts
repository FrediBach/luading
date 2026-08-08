import { luaQuotedString } from '../lua-source'
import type {
  DisplayDesignBinding,
  DisplayDesignDocument,
  DisplayDesignerFinding,
  DisplayPrimitiveElement,
  DisplayScalar,
  DisplayStaticScalar,
  DisplaySymbolInstance,
} from './display-design-model'
import {
  createDisplayBindingMap,
  createDisplayTokenMap,
  displayScalarLuaExpression,
  displayShadeLuaExpression,
  formatLuaNumber,
  type DisplayBindingMap,
} from './display-design-resolution'
import { collectDisplayTokenExpressionReferences, type DisplayTokenMap } from './display-design-token-expressions'
import { validateDisplayDesign } from './display-design-validation'
import { optimizeDisplayPixelBox } from './display-design-pixel-box'

export type DisplayDesignGenerationResult =
  | {
      ok: true
      source: string
      generatedUtf8Bytes: number
      findings: DisplayDesignerFinding[]
      tokenLocations: Record<string, { line: number }>
    }
  | {
      ok: false
      source: ''
      generatedUtf8Bytes: 0
      findings: DisplayDesignerFinding[]
      tokenLocations: Record<string, { line: number }>
    }

export interface DisplayDesignSourceBuild {
  source: string
  generatedUtf8Bytes: number
  findings: DisplayDesignerFinding[]
  tokenReferenceCount: number
  tokenLocations: Record<string, { line: number }>
}

function finding(
  ruleId: string,
  severity: DisplayDesignerFinding['severity'],
  message: string,
  path: string,
  focus?: DisplayDesignerFinding['focus'],
): DisplayDesignerFinding {
  return { ruleId, severity, message, path, ...(focus ? { focus } : {}) }
}

function collectPrimitiveBindingIds(primitive: DisplayPrimitiveElement, bindingIds: Set<string>): void {
  const collectScalar = (scalar: DisplayScalar) => {
    if (scalar.kind === 'number-binding') bindingIds.add(scalar.bindingId)
  }
  if (primitive.visible.kind === 'boolean-binding') bindingIds.add(primitive.visible.bindingId)
  if (primitive.kind === 'pixel-box') return
  collectScalar(primitive.shade)
  if (primitive.kind === 'line' || primitive.kind === 'box') {
    collectScalar(primitive.x1)
    collectScalar(primitive.y1)
    collectScalar(primitive.x2)
    collectScalar(primitive.y2)
  } else if (primitive.kind === 'circle' || primitive.kind === 'polygon') {
    collectScalar(primitive.x)
    collectScalar(primitive.y)
    collectScalar(primitive.radius)
  } else {
    collectScalar(primitive.x)
    collectScalar(primitive.y)
    if (primitive.text.kind === 'text-binding') bindingIds.add(primitive.text.bindingId)
  }
}

function collectScalarTokenIds(scalar: DisplayScalar, tokenIds: Set<string>): number {
  const collect = (value: DisplayStaticScalar): number => {
    if (value.kind === 'literal') return 0
    const references = collectDisplayTokenExpressionReferences(value.expression)
    for (const tokenId of references) tokenIds.add(tokenId)
    let count = 0
    const visit = (expression: typeof value.expression): void => {
      if (expression.kind === 'token') count += 1
      else if (expression.kind === 'negate') visit(expression.operand)
      else if (expression.kind === 'binary') { visit(expression.left); visit(expression.right) }
    }
    visit(value.expression)
    return count
  }
  return scalar.kind === 'number-binding' ? collect(scalar.from) + collect(scalar.to) : collect(scalar)
}

function collectPrimitiveTokenIds(primitive: DisplayPrimitiveElement, tokenIds: Set<string>): number {
  if (primitive.kind === 'pixel-box') return 0
  let count = collectScalarTokenIds(primitive.shade, tokenIds)
  if (primitive.kind === 'line' || primitive.kind === 'box') {
    for (const property of ['x1', 'y1', 'x2', 'y2'] as const) count += collectScalarTokenIds(primitive[property], tokenIds)
  } else if (primitive.kind === 'circle' || primitive.kind === 'polygon') {
    for (const property of ['x', 'y', 'radius'] as const) count += collectScalarTokenIds(primitive[property], tokenIds)
  } else {
    count += collectScalarTokenIds(primitive.x, tokenIds) + collectScalarTokenIds(primitive.y, tokenIds)
  }
  return count
}

function bindingSource(binding: DisplayDesignBinding, indent = '  ', declare = true): string[] {
  const assignment = `${indent}${declare ? 'local ' : ''}${binding.luaName} = `
  if (binding.kind === 'number') {
    return [
      `${assignment}${formatLuaNumber(binding.previewValue)} -- TODO: connect this placeholder to self or a parameter.`,
      `${indent}${binding.luaName} = math.max(0.0, math.min(1.0, ${binding.luaName}))`,
    ]
  }
  if (binding.kind === 'boolean') {
    return [`${assignment}${binding.previewValue ? 'true' : 'false'} -- TODO: connect this placeholder to self or a parameter.`]
  }
  if (binding.kind === 'text') {
    return [`${assignment}${luaQuotedString(binding.previewValue)} -- TODO: connect this placeholder to self or a parameter.`]
  }
  const preview = binding.choices.find(({ id }) => id === binding.previewChoiceId)?.luaValue ?? binding.choices[0]?.luaValue ?? ''
  return [`${assignment}${luaQuotedString(preview)} -- TODO: choose this state from self or parameters.`]
}

function oneLineComment(value: string): string {
  return [...value].map((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint < 32 || codePoint === 127 ? ' ' : character
  }).join('').replace(/\s+/gu, ' ').trim()
}

function translatedScalarExpression(
  scalar: DisplayScalar,
  bindings: DisplayBindingMap,
  forceInteger: boolean,
  tokens: DisplayTokenMap,
  origin?: string,
): string {
  if (!origin) return displayScalarLuaExpression(scalar, bindings, forceInteger, tokens)
  const value = displayScalarLuaExpression(scalar, bindings, false, tokens)
  return forceInteger || scalar.kind === 'number-binding' && scalar.quantize === 'integer'
    ? `math.floor((${origin} + ${value}) + 0.5)`
    : `${origin} + ${value}`
}

function primitiveCall(
  primitive: DisplayPrimitiveElement,
  bindings: DisplayBindingMap,
  tokens: DisplayTokenMap,
  translation?: { x: string; y: string },
  polygonHelperName = 'drawPolygon',
): string {
  if (primitive.kind === 'pixel-box') return ''
  const shade = displayShadeLuaExpression(primitive.shade, bindings, tokens)
  if (primitive.kind === 'line') {
    const integer = !primitive.smooth
    const args = [
      translatedScalarExpression(primitive.x1, bindings, integer, tokens, translation?.x),
      translatedScalarExpression(primitive.y1, bindings, integer, tokens, translation?.y),
      translatedScalarExpression(primitive.x2, bindings, integer, tokens, translation?.x),
      translatedScalarExpression(primitive.y2, bindings, integer, tokens, translation?.y),
    ]
    return `${primitive.smooth ? 'drawSmoothLine' : 'drawLine'}(${[...args, shade].join(', ')})`
  }
  if (primitive.kind === 'box') {
    const args = [
      translatedScalarExpression(primitive.x1, bindings, true, tokens, translation?.x),
      translatedScalarExpression(primitive.y1, bindings, true, tokens, translation?.y),
      translatedScalarExpression(primitive.x2, bindings, true, tokens, translation?.x),
      translatedScalarExpression(primitive.y2, bindings, true, tokens, translation?.y),
    ]
    return `${primitive.fill ? 'drawRectangle' : 'drawBox'}(${[...args, shade].join(', ')})`
  }
  if (primitive.kind === 'circle') {
    const integer = !primitive.smooth
    const args = [
      translatedScalarExpression(primitive.x, bindings, integer, tokens, translation?.x),
      translatedScalarExpression(primitive.y, bindings, integer, tokens, translation?.y),
      displayScalarLuaExpression(primitive.radius, bindings, integer, tokens),
    ]
    return `${primitive.smooth ? 'drawSmoothCircle' : 'drawCircle'}(${[...args, shade].join(', ')})`
  }
  if (primitive.kind === 'polygon') {
    const args = [
      translatedScalarExpression(primitive.x, bindings, true, tokens, translation?.x),
      translatedScalarExpression(primitive.y, bindings, true, tokens, translation?.y),
      displayScalarLuaExpression(primitive.radius, bindings, true, tokens),
      String(primitive.sides),
      shade,
    ]
    return `${polygonHelperName}(${args.join(', ')})`
  }
  const text = primitive.text.kind === 'literal'
    ? luaQuotedString(primitive.text.value)
    : bindings.get(primitive.text.bindingId)?.luaName ?? '""'
  return `${primitive.tiny ? 'drawTinyText' : 'drawText'}(${translatedScalarExpression(primitive.x, bindings, true, tokens, translation?.x)}, ${translatedScalarExpression(primitive.y, bindings, true, tokens, translation?.y)}, ${text}, ${shade}, ${luaQuotedString(primitive.align)})`
}

function offsetPixelCoordinate(value: string, offset: number): string {
  if (offset === 0) return value
  return `${value} + ${formatLuaNumber(offset)}`
}

function pixelBoxCalls(
  primitive: Extract<DisplayPrimitiveElement, { kind: 'pixel-box' }>,
  bindings: DisplayBindingMap,
  tokens: DisplayTokenMap,
  translation?: { x: string; y: string },
): string[] {
  const originX = translatedScalarExpression(primitive.x, bindings, true, tokens, translation?.x)
  const originY = translatedScalarExpression(primitive.y, bindings, true, tokens, translation?.y)
  return optimizeDisplayPixelBox(primitive.width, primitive.height, primitive.shades).map((region) => {
    const x1 = offsetPixelCoordinate(originX, region.x1)
    const y1 = offsetPixelCoordinate(originY, region.y1)
    const x2 = offsetPixelCoordinate(originX, region.x2)
    const y2 = offsetPixelCoordinate(originY, region.y2)
    const functionName = region.x1 === region.x2 || region.y1 === region.y2 ? 'drawLine' : 'drawRectangle'
    return `${functionName}(${x1}, ${y1}, ${x2}, ${y2}, ${region.shade})`
  })
}

function primitiveSource(
  primitive: DisplayPrimitiveElement,
  bindings: DisplayBindingMap,
  tokens: DisplayTokenMap,
  indent = '  ',
  translation?: { x: string; y: string },
  polygonHelperName = 'drawPolygon',
): string[] {
  const lines = [`${indent}-- ${oneLineComment(primitive.name)}`]
  const calls = primitive.kind === 'pixel-box'
    ? pixelBoxCalls(primitive, bindings, tokens, translation)
    : [primitiveCall(primitive, bindings, tokens, translation, polygonHelperName)]
  if (primitive.visible.kind === 'visible') {
    for (const call of calls) lines.push(`${indent}${call}`)
    return lines
  }
  const binding = bindings.get(primitive.visible.bindingId)
  const luaName = binding?.kind === 'boolean' ? binding.luaName : 'false'
  lines.push(`${indent}if ${primitive.visible.invert ? `not ${luaName}` : luaName} then`)
  for (const call of calls) lines.push(`${indent}  ${call}`)
  lines.push(`${indent}end`)
  return lines
}

function collectInstanceBindingIds(instance: DisplaySymbolInstance, bindingIds: Set<string>): void {
  for (const scalar of [instance.x, instance.y]) if (scalar.kind === 'number-binding') bindingIds.add(scalar.bindingId)
  if (instance.visible.kind === 'boolean-binding') bindingIds.add(instance.visible.bindingId)
  if (instance.state.kind === 'choice-binding') bindingIds.add(instance.state.bindingId)
}

function symbolHelperSource(
  document: DisplayDesignDocument,
  symbolId: string,
  bindings: DisplayBindingMap,
  tokens: DisplayTokenMap,
  polygonHelperName: string,
): string[] {
  const symbol = document.symbols.find(({ id }) => id === symbolId)
  if (!symbol) return []
  const defaultVariant = symbol.variants.find(({ id }) => id === symbol.defaultVariantId) ?? symbol.variants[0]
  if (!defaultVariant) return []
  const branches = symbol.variants.filter(({ id }) => id !== defaultVariant.id)
  const lines = [`  local function ${symbol.luaName}(x, y, state)`]
  for (const [index, variant] of branches.entries()) {
    lines.push(`    ${index === 0 ? 'if' : 'elseif'} state == ${luaQuotedString(variant.luaValue)} then`)
    for (const primitive of variant.elements) lines.push(...primitiveSource(primitive, bindings, tokens, '      ', { x: 'x', y: 'y' }, polygonHelperName))
  }
  if (branches.length > 0) lines.push('    else')
  lines.push(`      -- Default state: ${oneLineComment(defaultVariant.name)}`)
  for (const primitive of defaultVariant.elements) lines.push(...primitiveSource(primitive, bindings, tokens, '      ', { x: 'x', y: 'y' }, polygonHelperName))
  if (branches.length > 0) lines.push('    end')
  lines.push('  end')
  return lines
}

function displayPolygonHelperName(document: DisplayDesignDocument): string {
  const used = new Set([
    ...document.tokens.map(({ luaName }) => luaName),
    ...document.bindings.map(({ luaName }) => luaName),
    ...document.symbols.map(({ luaName }) => luaName),
  ])
  const base = 'drawPolygon'
  let name = base
  let suffix = 2
  while (used.has(name)) name = `${base}_${suffix++}`
  return name
}

function polygonHelperSource(name: string): string[] {
  return [
    `  local function ${name}(x, y, radius, sides, shade)`,
    '    local step = 2 * math.pi / sides',
    '    local first_x = math.floor(x + 0.5)',
    '    local first_y = math.floor((y - radius) + 0.5)',
    '    local previous_x = first_x',
    '    local previous_y = first_y',
    '    for index = 1, sides - 1 do',
    '      local angle = -math.pi / 2 + index * step',
    '      local next_x = math.floor((x + math.cos(angle) * radius) + 0.5)',
    '      local next_y = math.floor((y + math.sin(angle) * radius) + 0.5)',
    '      drawLine(previous_x, previous_y, next_x, next_y, shade)',
    '      previous_x = next_x',
    '      previous_y = next_y',
    '    end',
    '    drawLine(previous_x, previous_y, first_x, first_y, shade)',
    '  end',
  ]
}

function instanceSource(
  document: DisplayDesignDocument,
  instance: DisplaySymbolInstance,
  bindings: DisplayBindingMap,
  tokens: DisplayTokenMap,
): string[] {
  const symbol = document.symbols.find(({ id }) => id === instance.symbolId)
  if (!symbol) return []
  const x = displayScalarLuaExpression(instance.x, bindings, false, tokens)
  const y = displayScalarLuaExpression(instance.y, bindings, false, tokens)
  const instanceState = instance.state
  let state = luaQuotedString(symbol.variants.find(({ id }) => id === symbol.defaultVariantId)?.luaValue ?? '')
  if (instanceState.kind === 'literal') {
    state = luaQuotedString(symbol.variants.find(({ id }) => id === instanceState.variantId)?.luaValue ?? '')
  } else {
    const binding = bindings.get(instanceState.bindingId)
    state = binding?.kind === 'choice' ? binding.luaName : state
  }
  const call = `${symbol.luaName}(${x}, ${y}, ${state})`
  const lines = [`    -- ${oneLineComment(instance.name)}`]
  if (instance.visible.kind === 'visible') lines.push(`    ${call}`)
  else {
    const binding = bindings.get(instance.visible.bindingId)
    const luaName = binding?.kind === 'boolean' ? binding.luaName : 'false'
    lines.push(`    if ${instance.visible.invert ? `not ${luaName}` : luaName} then`, `      ${call}`, '    end')
  }
  return lines
}

export function buildDisplayDesignSource(document: DisplayDesignDocument): DisplayDesignSourceBuild {
  const findings: DisplayDesignerFinding[] = []
  const usedBindingIds = new Set<string>()
  const usedSymbolIds = new Set<string>()
  const usedTokenIds = new Set<string>()
  let tokenReferenceCount = 0
  for (const element of document.elements) {
    if (element.kind === 'symbol-instance') {
      usedSymbolIds.add(element.symbolId)
      collectInstanceBindingIds(element, usedBindingIds)
      tokenReferenceCount += collectScalarTokenIds(element.x, usedTokenIds) + collectScalarTokenIds(element.y, usedTokenIds)
      continue
    }
    collectPrimitiveBindingIds(element, usedBindingIds)
    tokenReferenceCount += collectPrimitiveTokenIds(element, usedTokenIds)
  }
  for (const symbol of document.symbols) {
    if (!usedSymbolIds.has(symbol.id)) continue
    for (const variant of symbol.variants) for (const primitive of variant.elements) {
      collectPrimitiveBindingIds(primitive, usedBindingIds)
      tokenReferenceCount += collectPrimitiveTokenIds(primitive, usedTokenIds)
    }
  }
  for (const [index, binding] of document.bindings.entries()) {
    if (!usedBindingIds.has(binding.id)) findings.push(finding(
      'unused-binding',
      'warning',
      `Binding “${binding.name}” is not used by generated drawing code.`,
      `bindings[${index}]`,
      { bindingId: binding.id },
    ))
  }
  for (const [index, symbol] of document.symbols.entries()) {
    if (!usedSymbolIds.has(symbol.id)) findings.push(finding(
      'unused-symbol',
      'warning',
      `Symbol “${symbol.name}” has no scene instances and is omitted from generated code.`,
      `symbols[${index}]`,
      { symbolId: symbol.id },
    ))
  }
  if (findings.some(({ severity }) => severity === 'error')) return { source: '', generatedUtf8Bytes: 0, findings, tokenReferenceCount, tokenLocations: {} }

  const bindings = createDisplayBindingMap(document.bindings)
  const tokens = createDisplayTokenMap(document.tokens)
  const usedTokens = document.tokens.filter(({ id }) => usedTokenIds.has(id))
  const usesPolygon = document.elements.some((element) => element.kind === 'polygon')
    || document.symbols.some((symbol) => usedSymbolIds.has(symbol.id) && symbol.variants.some((variant) => variant.elements.some((primitive) => primitive.kind === 'polygon')))
  const polygonHelperName = displayPolygonHelperName(document)
  if (usedSymbolIds.size === 0 && usedTokens.length === 0 && !usesPolygon) {
    const lines = [
    'draw = function(self)',
    '  -- Generated by Luading Display designer; edit freely after copying.',
    ]
    const usedBindings = document.bindings.filter(({ id }) => usedBindingIds.has(id))
    if (usedBindings.length > 0) {
      for (const binding of usedBindings) lines.push(...bindingSource(binding))
      lines.push('')
    }
    const primitives = document.elements.filter((element): element is DisplayPrimitiveElement => element.kind !== 'symbol-instance')
    for (const [index, primitive] of primitives.entries()) {
      lines.push(...primitiveSource(primitive, bindings, tokens))
      if (index < primitives.length - 1) lines.push('')
    }
    if (document.displayMode === 'full-screen') {
      if (primitives.length > 0) lines.push('')
      lines.push('  return true')
    }
    lines.push('end,')
    const source = `${lines.join('\n')}\n`
    return { source, generatedUtf8Bytes: new TextEncoder().encode(source).byteLength, findings, tokenReferenceCount, tokenLocations: {} }
  }

  const usedBindings = document.bindings.filter(({ id }) => usedBindingIds.has(id))
  const lines = ['draw = (function()']
  const tokenLocations: Record<string, { line: number }> = {}
  if (usedTokens.length > 0) {
    lines.push('  -- Design tokens: change these values to fine-tune the layout.')
    for (const token of usedTokens) {
      tokenLocations[token.id] = { line: lines.length + 1 }
      lines.push(`  local ${token.luaName} = ${formatLuaNumber(token.value)}`)
    }
    lines.push('')
  }
  if (usedBindings.length > 0) {
    for (const binding of usedBindings) lines.push(`  local ${binding.luaName}`)
    lines.push('')
  }
  if (usesPolygon) lines.push(...polygonHelperSource(polygonHelperName), '')
  for (const symbol of document.symbols) {
    if (!usedSymbolIds.has(symbol.id)) continue
    lines.push(...symbolHelperSource(document, symbol.id, bindings, tokens, polygonHelperName), '')
  }
  lines.push('  return function(self)', '    -- Generated by Luading Display designer; edit freely after copying.')
  if (usedBindings.length > 0) {
    for (const binding of usedBindings) lines.push(...bindingSource(binding, '    ', false))
    lines.push('')
  }
  for (const [index, element] of document.elements.entries()) {
    if (element.kind === 'symbol-instance') lines.push(...instanceSource(document, element, bindings, tokens))
    else lines.push(...primitiveSource(element, bindings, tokens, '    ', undefined, polygonHelperName))
    if (index < document.elements.length - 1) lines.push('')
  }
  if (document.displayMode === 'full-screen') {
    if (document.elements.length > 0) lines.push('')
    lines.push('    return true')
  }
  lines.push('  end', 'end)(),')
  const source = `${lines.join('\n')}\n`
  return { source, generatedUtf8Bytes: new TextEncoder().encode(source).byteLength, findings, tokenReferenceCount, tokenLocations }
}

export function generateDisplayDesignLua(value: DisplayDesignDocument): DisplayDesignGenerationResult {
  const validation = validateDisplayDesign(value)
  if (!validation.document || !validation.ok) {
    return { ok: false, source: '', generatedUtf8Bytes: 0, findings: validation.findings, tokenLocations: {} }
  }
  const build = buildDisplayDesignSource(validation.document)
  const findings = [...validation.findings, ...build.findings]
  if (build.source === '' || findings.some(({ severity }) => severity === 'error')) {
    return { ok: false, source: '', generatedUtf8Bytes: 0, findings, tokenLocations: build.tokenLocations }
  }
  return { ok: true, source: build.source, generatedUtf8Bytes: build.generatedUtf8Bytes, findings, tokenLocations: build.tokenLocations }
}
