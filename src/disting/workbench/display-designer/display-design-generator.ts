import { luaQuotedString } from '../lua-source'
import type {
  DisplayDesignBinding,
  DisplayDesignDocumentV1,
  DisplayDesignerFinding,
  DisplayPrimitiveElement,
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

function bindingSource(binding: DisplayDesignBinding): string[] {
  if (binding.kind === 'number') {
    return [
      `  local ${binding.luaName} = ${formatLuaNumber(binding.previewValue)} -- TODO: connect this placeholder to self or a parameter.`,
      `  ${binding.luaName} = math.max(0.0, math.min(1.0, ${binding.luaName}))`,
    ]
  }
  if (binding.kind === 'boolean') {
    return [`  local ${binding.luaName} = ${binding.previewValue ? 'true' : 'false'} -- TODO: connect this placeholder to self or a parameter.`]
  }
  if (binding.kind === 'text') {
    return [`  local ${binding.luaName} = ${luaQuotedString(binding.previewValue)} -- TODO: connect this placeholder to self or a parameter.`]
  }
  const preview = binding.choices.find(({ id }) => id === binding.previewChoiceId)?.luaValue ?? binding.choices[0]?.luaValue ?? ''
  return [`  local ${binding.luaName} = ${luaQuotedString(preview)} -- TODO: choose this state from self or parameters.`]
}

function oneLineComment(value: string): string {
  return [...value].map((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint < 32 || codePoint === 127 ? ' ' : character
  }).join('').replace(/\s+/gu, ' ').trim()
}

function primitiveCall(primitive: DisplayPrimitiveElement, bindings: DisplayBindingMap): string {
  const shade = displayShadeLuaExpression(primitive.shade, bindings)
  if (primitive.kind === 'line') {
    const integer = !primitive.smooth
    const args = [primitive.x1, primitive.y1, primitive.x2, primitive.y2]
      .map((scalar) => displayScalarLuaExpression(scalar, bindings, integer))
    return `${primitive.smooth ? 'drawSmoothLine' : 'drawLine'}(${[...args, shade].join(', ')})`
  }
  if (primitive.kind === 'box') {
    const args = [primitive.x1, primitive.y1, primitive.x2, primitive.y2]
      .map((scalar) => displayScalarLuaExpression(scalar, bindings, true))
    return `${primitive.fill ? 'drawRectangle' : 'drawBox'}(${[...args, shade].join(', ')})`
  }
  if (primitive.kind === 'circle') {
    const integer = !primitive.smooth
    const args = [primitive.x, primitive.y, primitive.radius]
      .map((scalar) => displayScalarLuaExpression(scalar, bindings, integer))
    return `${primitive.smooth ? 'drawSmoothCircle' : 'drawCircle'}(${[...args, shade].join(', ')})`
  }
  const text = primitive.text.kind === 'literal'
    ? luaQuotedString(primitive.text.value)
    : bindings.get(primitive.text.bindingId)?.luaName ?? '""'
  return `${primitive.tiny ? 'drawTinyText' : 'drawText'}(${displayScalarLuaExpression(primitive.x, bindings, true)}, ${displayScalarLuaExpression(primitive.y, bindings, true)}, ${text}, ${shade}, ${luaQuotedString(primitive.align)})`
}

function primitiveSource(primitive: DisplayPrimitiveElement, bindings: DisplayBindingMap): string[] {
  const lines = [`  -- ${oneLineComment(primitive.name)}`]
  const call = primitiveCall(primitive, bindings)
  if (primitive.visible.kind === 'visible') {
    lines.push(`  ${call}`)
    return lines
  }
  const binding = bindings.get(primitive.visible.bindingId)
  const luaName = binding?.kind === 'boolean' ? binding.luaName : 'false'
  lines.push(`  if ${primitive.visible.invert ? `not ${luaName}` : luaName} then`, `    ${call}`, '  end')
  return lines
}

export function buildDisplayDesignSource(document: DisplayDesignDocumentV1): DisplayDesignSourceBuild {
  const findings: DisplayDesignerFinding[] = []
  const usedBindingIds = new Set<string>()
  const usedSymbolIds = new Set<string>()
  for (const [index, element] of document.elements.entries()) {
    if (element.kind === 'symbol-instance') {
      usedSymbolIds.add(element.symbolId)
      findings.push(finding(
        'symbol-expansion-unavailable',
        'error',
        'Symbol instances will be generated after the symbol expansion increment is implemented.',
        `elements[${index}]`,
        { elementId: element.id, property: 'symbolId' },
      ))
      continue
    }
    collectPrimitiveBindingIds(element, usedBindingIds)
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

export function generateDisplayDesignLua(value: DisplayDesignDocumentV1): DisplayDesignGenerationResult {
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
