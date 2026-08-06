import { rasterizeDistingText } from '../../emulation/display-font'
import { DISTING_DISPLAY, type DrawCommand } from '../../types'
import {
  type DisplayDesignDocumentV1,
  type DisplayDesignerFinding,
  type DisplayPrimitiveElement,
} from './display-design-model'
import {
  createDisplayBindingMap,
  resolveDisplayScalar,
  resolveDisplayText,
  resolveDisplayVisibility,
  type DisplayBindingMap,
} from './display-design-resolution'
import { buildDisplayDesignSource } from './display-design-generator'
import { validateDisplayDesign } from './display-design-validation'

export interface DisplayCommandSource {
  elementId: string
  symbolId?: string
  variantId?: string
  primitiveId?: string
  firstCommand: number
  commandCount: number
}

export interface CompiledDisplayDesignMetrics {
  elementCount: number
  symbolCount: number
  instanceCount: number
  drawCallCount: number
  maximumVariantDrawCallCount: number
  smoothCallCount: number
  generatedUtf8Bytes: number
}

export interface CompiledDisplayDesign {
  commands: DrawCommand[]
  commandSources: DisplayCommandSource[]
  findings: DisplayDesignerFinding[]
  metrics: CompiledDisplayDesignMetrics
}

export interface DisplayPrimitiveTranslation {
  x: number
  y: number
}

interface CommandBounds {
  left: number
  top: number
  right: number
  bottom: number
}

const NO_TRANSLATION: DisplayPrimitiveTranslation = { x: 0, y: 0 }

function shade(value: number): number {
  return Math.min(15, Math.max(0, Math.round(value)))
}

function translated(value: number, offset: number, integer: boolean): number {
  const result = value + offset
  return integer ? Math.trunc(result) : result
}

export function compileDisplayPrimitive(
  primitive: DisplayPrimitiveElement,
  bindings: DisplayBindingMap,
  translation: DisplayPrimitiveTranslation = NO_TRANSLATION,
): DrawCommand | undefined {
  if (!resolveDisplayVisibility(primitive.visible, bindings)) return undefined
  const resolvedShade = shade(resolveDisplayScalar(primitive.shade, bindings))
  if (primitive.kind === 'line') {
    return {
      kind: 'line',
      x1: translated(resolveDisplayScalar(primitive.x1, bindings), translation.x, !primitive.smooth),
      y1: translated(resolveDisplayScalar(primitive.y1, bindings), translation.y, !primitive.smooth),
      x2: translated(resolveDisplayScalar(primitive.x2, bindings), translation.x, !primitive.smooth),
      y2: translated(resolveDisplayScalar(primitive.y2, bindings), translation.y, !primitive.smooth),
      shade: resolvedShade,
      smooth: primitive.smooth,
    }
  }
  if (primitive.kind === 'box') {
    return {
      kind: 'box',
      x1: translated(resolveDisplayScalar(primitive.x1, bindings), translation.x, true),
      y1: translated(resolveDisplayScalar(primitive.y1, bindings), translation.y, true),
      x2: translated(resolveDisplayScalar(primitive.x2, bindings), translation.x, true),
      y2: translated(resolveDisplayScalar(primitive.y2, bindings), translation.y, true),
      shade: resolvedShade,
      fill: primitive.fill,
      smooth: false,
    }
  }
  if (primitive.kind === 'circle') {
    return {
      kind: 'circle',
      x: translated(resolveDisplayScalar(primitive.x, bindings), translation.x, !primitive.smooth),
      y: translated(resolveDisplayScalar(primitive.y, bindings), translation.y, !primitive.smooth),
      radius: resolveDisplayScalar(primitive.radius, bindings),
      shade: resolvedShade,
      smooth: primitive.smooth,
    }
  }
  return {
    kind: 'text',
    x: translated(resolveDisplayScalar(primitive.x, bindings), translation.x, true),
    y: translated(resolveDisplayScalar(primitive.y, bindings), translation.y, true),
    text: resolveDisplayText(primitive.text, bindings),
    shade: resolvedShade,
    tiny: primitive.tiny,
    align: primitive.align,
  }
}

function commandBounds(command: DrawCommand): CommandBounds | undefined {
  if (command.kind === 'line' || command.kind === 'box') {
    return {
      left: Math.min(command.x1, command.x2),
      top: Math.min(command.y1, command.y2),
      right: Math.max(command.x1, command.x2),
      bottom: Math.max(command.y1, command.y2),
    }
  }
  if (command.kind === 'circle') {
    return {
      left: command.x - command.radius,
      top: command.y - command.radius,
      right: command.x + command.radius,
      bottom: command.y + command.radius,
    }
  }
  const pixels = rasterizeDistingText(command.x, command.y, command.text, command.tiny, command.align)
  if (pixels.length === 0) return undefined
  return {
    left: Math.min(...pixels.map(({ x }) => x)),
    top: Math.min(...pixels.map(({ y }) => y)),
    right: Math.max(...pixels.map(({ x }) => x)),
    bottom: Math.max(...pixels.map(({ y }) => y)),
  }
}

function boundsFindings(
  document: DisplayDesignDocumentV1,
  command: DrawCommand,
  elementId: string,
  elementIndex: number,
): DisplayDesignerFinding[] {
  const bounds = commandBounds(command)
  if (!bounds) return []
  const focus = { elementId }
  const path = `elements[${elementIndex}]`
  const outside = bounds.right < 0
    || bounds.bottom < 0
    || bounds.left >= DISTING_DISPLAY.width
    || bounds.top >= DISTING_DISPLAY.height
  const clipped = !outside && (
    bounds.left < 0
    || bounds.top < 0
    || bounds.right >= DISTING_DISPLAY.width
    || bounds.bottom >= DISTING_DISPLAY.height
  )
  const findings: DisplayDesignerFinding[] = []
  if (outside) findings.push({
    ruleId: 'outside-artboard', severity: 'warning',
    message: 'This element is completely outside the 256×64 artboard.', path, focus,
  })
  else if (clipped) findings.push({
    ruleId: 'clipped-element', severity: 'warning',
    message: 'This element is clipped by the 256×64 artboard.', path, focus,
  })
  if (
    document.displayMode === 'parameter-line'
    && bounds.right >= 0
    && bounds.left < DISTING_DISPLAY.width
    && bounds.top <= 9
    && bounds.bottom >= 0
  ) findings.push({
    ruleId: 'reserved-row-overlap', severity: 'warning',
    message: 'This element overlaps rows 0–9 reserved for the standard parameter line.', path, focus,
  })
  return findings
}

function emptyMetrics(document?: DisplayDesignDocumentV1): CompiledDisplayDesignMetrics {
  const elementCount = document
    ? document.elements.filter(({ kind }) => kind !== 'symbol-instance').length
      + document.symbols.reduce((count, symbol) => count + symbol.variants.reduce((sum, variant) => sum + variant.elements.length, 0), 0)
    : 0
  return {
    elementCount,
    symbolCount: document?.symbols.length ?? 0,
    instanceCount: document?.elements.filter(({ kind }) => kind === 'symbol-instance').length ?? 0,
    drawCallCount: 0,
    maximumVariantDrawCallCount: 0,
    smoothCallCount: 0,
    generatedUtf8Bytes: 0,
  }
}

export function compileDisplayDesign(value: DisplayDesignDocumentV1): CompiledDisplayDesign {
  const validation = validateDisplayDesign(value)
  if (!validation.document || !validation.ok) {
    return { commands: [], commandSources: [], findings: validation.findings, metrics: emptyMetrics(validation.document) }
  }
  const document = validation.document
  const sourceBuild = buildDisplayDesignSource(document)
  const initialFindings = [...validation.findings, ...sourceBuild.findings]
  if (initialFindings.some(({ severity }) => severity === 'error')) {
    return { commands: [], commandSources: [], findings: initialFindings, metrics: emptyMetrics(document) }
  }

  const bindings = createDisplayBindingMap(document.bindings)
  const commands: DrawCommand[] = []
  const commandSources: DisplayCommandSource[] = []
  const findings = [...initialFindings]
  for (const [elementIndex, element] of document.elements.entries()) {
    if (element.kind === 'symbol-instance') continue
    const command = compileDisplayPrimitive(element, bindings)
    if (!command) continue
    const firstCommand = commands.length
    commands.push(command)
    commandSources.push({ elementId: element.id, firstCommand, commandCount: 1 })
    findings.push(...boundsFindings(document, command, element.id, elementIndex))
  }
  const smoothCallCount = commands.filter((command) => (
    (command.kind === 'line' || command.kind === 'circle') && command.smooth
  )).length
  return {
    commands,
    commandSources,
    findings,
    metrics: {
      ...emptyMetrics(document),
      drawCallCount: commands.length,
      maximumVariantDrawCallCount: commands.length,
      smoothCallCount,
      generatedUtf8Bytes: sourceBuild.generatedUtf8Bytes,
    },
  }
}
