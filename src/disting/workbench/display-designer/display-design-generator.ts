import { luaQuotedString } from '../lua-source'
import type {
  DisplayDesignBinding,
  DisplayDesignDocument,
  DisplayDesignerFinding,
  DisplayPrimitiveElement,
  DisplayScalar,
  DisplaySymbolInstance,
} from './display-design-model'
import {
  createDisplayBindingMap,
  displayScalarLuaExpression,
  displayShadeLuaExpression,
  formatLuaNumber,
  type DisplayBindingMap,
} from './display-design-resolution'
import { validateDisplayDesign } from './display-design-validation'

export type DisplayDesignGenerationResult =
  | {
      ok: true
      source: string
      generatedUtf8Bytes: number
      findings: DisplayDesignerFinding[]
    }
  | {
      ok: false
      source: ''
      generatedUtf8Bytes: 0
      findings: DisplayDesignerFinding[]
    }

export interface DisplayDesignSourceBuild {
  source: string
  generatedUtf8Bytes: number
  findings: DisplayDesignerFinding[]
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
  const collectScalar = (scalar: DisplayPrimitiveElement['shade']) => {
    if (scalar.kind === 'number-binding') bindingIds.add(scalar.bindingId)
  }
  collectScalar(primitive.shade)
  if (primitive.visible.kind === 'boolean-binding') bindingIds.add(primitive.visible.bindingId)
  if (primitive.kind === 'line' || primitive.kind === 'box') {
    collectScalar(primitive.x1)
    collectScalar(primitive.y1)
    collectScalar(primitive.x2)
    collectScalar(primitive.y2)
  } else if (primitive.kind === 'circle') {
    collectScalar(primitive.x)
    collectScalar(primitive.y)
    collectScalar(primitive.radius)
  } else {
    collectScalar(primitive.x)
    collectScalar(primitive.y)
    if (primitive.text.kind === 'text-binding') bindingIds.add(primitive.text.bindingId)
  }
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
  origin?: string,
): string {
  if (!origin) return displayScalarLuaExpression(scalar, bindings, forceInteger)
  const value = displayScalarLuaExpression(scalar, bindings, false)
  return forceInteger || scalar.kind === 'number-binding' && scalar.quantize === 'integer'
    ? `math.floor((${origin} + ${value}) + 0.5)`
    : `${origin} + ${value}`
}

function primitiveCall(
  primitive: DisplayPrimitiveElement,
  bindings: DisplayBindingMap,
  translation?: { x: string; y: string },
): string {
  const shade = displayShadeLuaExpression(primitive.shade, bindings)
  if (primitive.kind === 'line') {
    const integer = !primitive.smooth
    const args = [
      translatedScalarExpression(primitive.x1, bindings, integer, translation?.x),
      translatedScalarExpression(primitive.y1, bindings, integer, translation?.y),
      translatedScalarExpression(primitive.x2, bindings, integer, translation?.x),
      translatedScalarExpression(primitive.y2, bindings, integer, translation?.y),
    ]
    return `${primitive.smooth ? 'drawSmoothLine' : 'drawLine'}(${[...args, shade].join(', ')})`
  }
  if (primitive.kind === 'box') {
    const args = [
      translatedScalarExpression(primitive.x1, bindings, true, translation?.x),
      translatedScalarExpression(primitive.y1, bindings, true, translation?.y),
      translatedScalarExpression(primitive.x2, bindings, true, translation?.x),
      translatedScalarExpression(primitive.y2, bindings, true, translation?.y),
    ]
    return `${primitive.fill ? 'drawRectangle' : 'drawBox'}(${[...args, shade].join(', ')})`
  }
  if (primitive.kind === 'circle') {
    const integer = !primitive.smooth
    const args = [
      translatedScalarExpression(primitive.x, bindings, integer, translation?.x),
      translatedScalarExpression(primitive.y, bindings, integer, translation?.y),
      displayScalarLuaExpression(primitive.radius, bindings, integer),
    ]
    return `${primitive.smooth ? 'drawSmoothCircle' : 'drawCircle'}(${[...args, shade].join(', ')})`
  }
  const text = primitive.text.kind === 'literal'
    ? luaQuotedString(primitive.text.value)
    : bindings.get(primitive.text.bindingId)?.luaName ?? '""'
  return `${primitive.tiny ? 'drawTinyText' : 'drawText'}(${translatedScalarExpression(primitive.x, bindings, true, translation?.x)}, ${translatedScalarExpression(primitive.y, bindings, true, translation?.y)}, ${text}, ${shade}, ${luaQuotedString(primitive.align)})`
}

function primitiveSource(
  primitive: DisplayPrimitiveElement,
  bindings: DisplayBindingMap,
  indent = '  ',
  translation?: { x: string; y: string },
): string[] {
  const lines = [`${indent}-- ${oneLineComment(primitive.name)}`]
  const call = primitiveCall(primitive, bindings, translation)
  if (primitive.visible.kind === 'visible') {
    lines.push(`${indent}${call}`)
    return lines
  }
  const binding = bindings.get(primitive.visible.bindingId)
  const luaName = binding?.kind === 'boolean' ? binding.luaName : 'false'
  lines.push(`${indent}if ${primitive.visible.invert ? `not ${luaName}` : luaName} then`, `${indent}  ${call}`, `${indent}end`)
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
): string[] {
  const symbol = document.symbols.find(({ id }) => id === symbolId)
  if (!symbol) return []
  const defaultVariant = symbol.variants.find(({ id }) => id === symbol.defaultVariantId) ?? symbol.variants[0]
  if (!defaultVariant) return []
  const branches = symbol.variants.filter(({ id }) => id !== defaultVariant.id)
  const lines = [`  local function ${symbol.luaName}(x, y, state)`]
  for (const [index, variant] of branches.entries()) {
    lines.push(`    ${index === 0 ? 'if' : 'elseif'} state == ${luaQuotedString(variant.luaValue)} then`)
    for (const primitive of variant.elements) lines.push(...primitiveSource(primitive, bindings, '      ', { x: 'x', y: 'y' }))
  }
  if (branches.length > 0) lines.push('    else')
  lines.push(`      -- Default state: ${oneLineComment(defaultVariant.name)}`)
  for (const primitive of defaultVariant.elements) lines.push(...primitiveSource(primitive, bindings, '      ', { x: 'x', y: 'y' }))
  if (branches.length > 0) lines.push('    end')
  lines.push('  end')
  return lines
}

function instanceSource(
  document: DisplayDesignDocument,
  instance: DisplaySymbolInstance,
  bindings: DisplayBindingMap,
): string[] {
  const symbol = document.symbols.find(({ id }) => id === instance.symbolId)
  if (!symbol) return []
  const x = displayScalarLuaExpression(instance.x, bindings, false)
  const y = displayScalarLuaExpression(instance.y, bindings, false)
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
  for (const element of document.elements) {
    if (element.kind === 'symbol-instance') {
      usedSymbolIds.add(element.symbolId)
      collectInstanceBindingIds(element, usedBindingIds)
      continue
    }
    collectPrimitiveBindingIds(element, usedBindingIds)
  }
  for (const symbol of document.symbols) {
    if (!usedSymbolIds.has(symbol.id)) continue
    for (const variant of symbol.variants) for (const primitive of variant.elements) collectPrimitiveBindingIds(primitive, usedBindingIds)
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
  if (findings.some(({ severity }) => severity === 'error')) return { source: '', generatedUtf8Bytes: 0, findings }

  const bindings = createDisplayBindingMap(document.bindings)
  if (usedSymbolIds.size === 0) {
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
      lines.push(...primitiveSource(primitive, bindings))
      if (index < primitives.length - 1) lines.push('')
    }
    if (document.displayMode === 'full-screen') {
      if (primitives.length > 0) lines.push('')
      lines.push('  return true')
    }
    lines.push('end,')
    const source = `${lines.join('\n')}\n`
    return { source, generatedUtf8Bytes: new TextEncoder().encode(source).byteLength, findings }
  }

  const usedBindings = document.bindings.filter(({ id }) => usedBindingIds.has(id))
  const lines = ['draw = (function()']
  if (usedBindings.length > 0) {
    for (const binding of usedBindings) lines.push(`  local ${binding.luaName}`)
    lines.push('')
  }
  for (const symbol of document.symbols) {
    if (!usedSymbolIds.has(symbol.id)) continue
    lines.push(...symbolHelperSource(document, symbol.id, bindings), '')
  }
  lines.push('  return function(self)', '    -- Generated by Luading Display designer; edit freely after copying.')
  if (usedBindings.length > 0) {
    for (const binding of usedBindings) lines.push(...bindingSource(binding, '    ', false))
    lines.push('')
  }
  for (const [index, element] of document.elements.entries()) {
    if (element.kind === 'symbol-instance') lines.push(...instanceSource(document, element, bindings))
    else lines.push(...primitiveSource(element, bindings, '    '))
    if (index < document.elements.length - 1) lines.push('')
  }
  if (document.displayMode === 'full-screen') {
    if (document.elements.length > 0) lines.push('')
    lines.push('    return true')
  }
  lines.push('  end', 'end)(),')
  const source = `${lines.join('\n')}\n`
  return { source, generatedUtf8Bytes: new TextEncoder().encode(source).byteLength, findings }
}

export function generateDisplayDesignLua(value: DisplayDesignDocument): DisplayDesignGenerationResult {
  const validation = validateDisplayDesign(value)
  if (!validation.document || !validation.ok) {
    return { ok: false, source: '', generatedUtf8Bytes: 0, findings: validation.findings }
  }
  const build = buildDisplayDesignSource(validation.document)
  const findings = [...validation.findings, ...build.findings]
  if (build.source === '' || findings.some(({ severity }) => severity === 'error')) {
    return { ok: false, source: '', generatedUtf8Bytes: 0, findings }
  }
  return { ok: true, source: build.source, generatedUtf8Bytes: build.generatedUtf8Bytes, findings }
}
