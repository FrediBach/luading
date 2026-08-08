import { rasterizeDistingText } from '../../emulation/display-font'
import { DISTING_DISPLAY, type DrawCommand } from '../../types'
import {
  activeDisplayDesignElements,
  type DisplayDesignDocument,
  type DisplayDesignerFinding,
  type DisplayPrimitiveElement,
  type DisplaySymbolInstance,
  type DisplaySymbolVariant,
} from './display-design-model'
import {
  createDisplayBindingMap,
  createDisplayTokenMap,
  resolveDisplayScalar,
  resolveDisplayText,
  resolveDisplayVisibility,
  type DisplayBindingMap,
} from './display-design-resolution'
import type { DisplayTokenMap } from './display-design-token-expressions'
import { buildDisplayDesignSource } from './display-design-generator'
import { optimizeDisplayPixelBox } from './display-design-pixel-box'
import { compileDisplayPolygonLines } from './display-design-polygon'
import { compileDisplayBezierLines } from './display-design-bezier'
import { compileDisplayAnimatedLine } from './display-design-animated-line'
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
  tokenCount: number
  tokenReferenceCount: number
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

export function resolveDisplayPixelBoxFrame(
  primitive: Extract<DisplayPrimitiveElement, { kind: 'pixel-box' }>,
  displayFrame = 0,
) {
  if (primitive.frameRate === null || primitive.frames.length < 2) return primitive.frames[0]!
  const displayFramesPerRateStep = 30 / primitive.frameRate
  const total = primitive.frames.reduce((sum, frame) => sum + frame.duration * displayFramesPerRateStep, 0)
  let position = ((Math.floor(displayFrame) % total) + total) % total
  for (const frame of primitive.frames) {
    const duration = frame.duration * displayFramesPerRateStep
    if (position < duration) return frame
    position -= duration
  }
  return primitive.frames[0]!
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
  return integer ? Math.round(result) : result
}

export function compileDisplayPrimitive(
  primitive: DisplayPrimitiveElement,
  bindings: DisplayBindingMap,
  translation: DisplayPrimitiveTranslation = NO_TRANSLATION,
  tokens: DisplayTokenMap = createDisplayTokenMap([]),
): DrawCommand | undefined {
  if (!resolveDisplayVisibility(primitive.visible, bindings)) return undefined
  if (primitive.kind === 'pixel-box') return compileDisplayPrimitiveCommands(primitive, bindings, translation, tokens)[0]
  const resolvedShade = shade(resolveDisplayScalar(primitive.shade, bindings, tokens))
  if (primitive.kind === 'animated-line') return compileDisplayPrimitiveCommands(primitive, bindings, translation, tokens)[0]
  if (primitive.kind === 'line') {
    return {
      kind: 'line',
      x1: translated(resolveDisplayScalar(primitive.x1, bindings, tokens), translation.x, !primitive.smooth),
      y1: translated(resolveDisplayScalar(primitive.y1, bindings, tokens), translation.y, !primitive.smooth),
      x2: translated(resolveDisplayScalar(primitive.x2, bindings, tokens), translation.x, !primitive.smooth),
      y2: translated(resolveDisplayScalar(primitive.y2, bindings, tokens), translation.y, !primitive.smooth),
      shade: resolvedShade,
      smooth: primitive.smooth,
    }
  }
  if (primitive.kind === 'box') {
    return {
      kind: 'box',
      x1: translated(resolveDisplayScalar(primitive.x1, bindings, tokens), translation.x, true),
      y1: translated(resolveDisplayScalar(primitive.y1, bindings, tokens), translation.y, true),
      x2: translated(resolveDisplayScalar(primitive.x2, bindings, tokens), translation.x, true),
      y2: translated(resolveDisplayScalar(primitive.y2, bindings, tokens), translation.y, true),
      shade: resolvedShade,
      fill: primitive.fill,
      smooth: false,
    }
  }
  if (primitive.kind === 'circle') {
    return {
      kind: 'circle',
      x: translated(resolveDisplayScalar(primitive.x, bindings, tokens), translation.x, !primitive.smooth),
      y: translated(resolveDisplayScalar(primitive.y, bindings, tokens), translation.y, !primitive.smooth),
      radius: resolveDisplayScalar(primitive.radius, bindings, tokens),
      shade: resolvedShade,
      smooth: primitive.smooth,
    }
  }
  if (primitive.kind === 'polygon') {
    return compileDisplayPolygonLines(
      translated(resolveDisplayScalar(primitive.x, bindings, tokens), translation.x, true),
      translated(resolveDisplayScalar(primitive.y, bindings, tokens), translation.y, true),
      Math.round(resolveDisplayScalar(primitive.radius, bindings, tokens)),
      primitive.sides,
      resolvedShade,
    )[0]
  }
  if (primitive.kind === 'bezier') {
    return compileDisplayBezierLines(
      primitive.points.map((point) => ({
        x: translated(resolveDisplayScalar(point.x, bindings, tokens), translation.x, true),
        y: translated(resolveDisplayScalar(point.y, bindings, tokens), translation.y, true),
      })),
      primitive.segments,
      resolvedShade,
    )[0]
  }
  return {
    kind: 'text',
    x: translated(resolveDisplayScalar(primitive.x, bindings, tokens), translation.x, true),
    y: translated(resolveDisplayScalar(primitive.y, bindings, tokens), translation.y, true),
    text: resolveDisplayText(primitive.text, bindings),
    shade: resolvedShade,
    tiny: primitive.tiny,
    align: primitive.align,
  }
}

export function compileDisplayPrimitiveCommands(
  primitive: DisplayPrimitiveElement,
  bindings: DisplayBindingMap,
  translation: DisplayPrimitiveTranslation = NO_TRANSLATION,
  tokens: DisplayTokenMap = createDisplayTokenMap([]),
  displayFrame = 0,
): DrawCommand[] {
  if (!resolveDisplayVisibility(primitive.visible, bindings)) return []
  if (primitive.kind === 'animated-line') {
    return compileDisplayAnimatedLine(
      translated(resolveDisplayScalar(primitive.x1, bindings, tokens), translation.x, true),
      translated(resolveDisplayScalar(primitive.y1, bindings, tokens), translation.y, true),
      translated(resolveDisplayScalar(primitive.x2, bindings, tokens), translation.x, true),
      translated(resolveDisplayScalar(primitive.y2, bindings, tokens), translation.y, true),
      shade(resolveDisplayScalar(primitive.shade, bindings, tokens)),
      shade(resolveDisplayScalar(primitive.secondaryShade, bindings, tokens)),
      primitive.direction,
      primitive.speed,
      displayFrame,
    )
  }
  if (primitive.kind === 'polygon') {
    return compileDisplayPolygonLines(
      translated(resolveDisplayScalar(primitive.x, bindings, tokens), translation.x, true),
      translated(resolveDisplayScalar(primitive.y, bindings, tokens), translation.y, true),
      Math.round(resolveDisplayScalar(primitive.radius, bindings, tokens)),
      primitive.sides,
      shade(resolveDisplayScalar(primitive.shade, bindings, tokens)),
    )
  }
  if (primitive.kind === 'bezier') {
    return compileDisplayBezierLines(
      primitive.points.map((point) => ({
        x: translated(resolveDisplayScalar(point.x, bindings, tokens), translation.x, true),
        y: translated(resolveDisplayScalar(point.y, bindings, tokens), translation.y, true),
      })),
      primitive.segments,
      shade(resolveDisplayScalar(primitive.shade, bindings, tokens)),
    )
  }
  if (primitive.kind !== 'pixel-box') {
    const command = compileDisplayPrimitive(primitive, bindings, translation, tokens)
    return command ? [command] : []
  }
  const originX = translated(resolveDisplayScalar(primitive.x, bindings, tokens), translation.x, true)
  const originY = translated(resolveDisplayScalar(primitive.y, bindings, tokens), translation.y, true)
  const frame = resolveDisplayPixelBoxFrame(primitive, displayFrame)
  return optimizeDisplayPixelBox(primitive.width, primitive.height, frame.shades).map((region): DrawCommand => {
    const x1 = originX + region.x1
    const y1 = originY + region.y1
    const x2 = originX + region.x2
    const y2 = originY + region.y2
    if (x1 === x2 || y1 === y2) return { kind: 'line', x1, y1, x2, y2, shade: region.shade, smooth: false }
    return { kind: 'box', x1, y1, x2, y2, shade: region.shade, fill: true, smooth: false }
  })
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
  document: DisplayDesignDocument,
  command: DrawCommand,
  elementId: string,
  elementIndex: number,
  source?: { symbolId: string; variantId: string; primitiveId: string },
): DisplayDesignerFinding[] {
  const bounds = commandBounds(command)
  if (!bounds) return []
  const focus = { elementId, ...source }
  const path = source
    ? `symbols[${document.symbols.findIndex(({ id }) => id === source.symbolId)}].variants[${document.symbols.find(({ id }) => id === source.symbolId)?.variants.findIndex(({ id }) => id === source.variantId) ?? -1}].elements`
    : `elements[${elementIndex}]`
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

function resolveInstanceVariant(
  instance: DisplaySymbolInstance,
  document: DisplayDesignDocument,
  bindings: DisplayBindingMap,
): DisplaySymbolVariant | undefined {
  const symbol = document.symbols.find(({ id }) => id === instance.symbolId)
  if (!symbol) return undefined
  let variantId = symbol.defaultVariantId
  if (instance.state.kind === 'literal') variantId = instance.state.variantId
  else {
    const binding = bindings.get(instance.state.bindingId)
    if (binding?.kind === 'choice') variantId = instance.state.variantByChoiceId[binding.previewChoiceId] ?? variantId
  }
  return symbol.variants.find(({ id }) => id === variantId)
    ?? symbol.variants.find(({ id }) => id === symbol.defaultVariantId)
}

function emptyMetrics(document?: DisplayDesignDocument): CompiledDisplayDesignMetrics {
  const activeElements = document ? activeDisplayDesignElements(document) : []
  const elementCount = document
    ? activeElements.filter(({ kind }) => kind !== 'symbol-instance').length
      + document.symbols.reduce((count, symbol) => count + symbol.variants.reduce((sum, variant) => sum + variant.elements.length, 0), 0)
    : 0
  return {
    elementCount,
    symbolCount: document?.symbols.length ?? 0,
    instanceCount: activeElements.filter(({ kind }) => kind === 'symbol-instance').length,
    drawCallCount: 0,
    maximumVariantDrawCallCount: 0,
    smoothCallCount: 0,
    generatedUtf8Bytes: 0,
    tokenCount: document?.tokens.length ?? 0,
    tokenReferenceCount: 0,
  }
}

export function compileDisplayDesign(value: DisplayDesignDocument, displayFrame = 0): CompiledDisplayDesign {
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
  const tokens = createDisplayTokenMap(document.tokens)
  const commands: DrawCommand[] = []
  const commandSources: DisplayCommandSource[] = []
  const findings = [...initialFindings]
  let maximumVariantDrawCallCount = 0
  for (const [elementIndex, element] of activeDisplayDesignElements(document).entries()) {
    if (element.kind !== 'symbol-instance') {
      const elementCommands = compileDisplayPrimitiveCommands(element, bindings, NO_TRANSLATION, tokens, displayFrame)
      if (elementCommands.length === 0) continue
      const firstCommand = commands.length
      commands.push(...elementCommands)
      commandSources.push({ elementId: element.id, firstCommand, commandCount: elementCommands.length })
      maximumVariantDrawCallCount += elementCommands.length
      const boundsCommand: DrawCommand = element.kind === 'pixel-box'
        ? {
            kind: 'box',
            x1: resolveDisplayScalar(element.x, bindings, tokens), y1: resolveDisplayScalar(element.y, bindings, tokens),
            x2: resolveDisplayScalar(element.x, bindings, tokens) + element.width - 1,
            y2: resolveDisplayScalar(element.y, bindings, tokens) + element.height - 1,
            shade: 15, fill: true, smooth: false,
          }
        : element.kind === 'animated-line'
          ? {
              kind: 'line',
              x1: resolveDisplayScalar(element.x1, bindings, tokens), y1: resolveDisplayScalar(element.y1, bindings, tokens),
              x2: resolveDisplayScalar(element.x2, bindings, tokens), y2: resolveDisplayScalar(element.y2, bindings, tokens),
              shade: 15, smooth: false,
            }
        : element.kind === 'polygon'
          ? {
              kind: 'circle',
              x: resolveDisplayScalar(element.x, bindings, tokens),
              y: resolveDisplayScalar(element.y, bindings, tokens),
              radius: resolveDisplayScalar(element.radius, bindings, tokens),
              shade: 15, smooth: false,
            }
        : element.kind === 'bezier'
          ? {
              kind: 'box',
              x1: Math.min(...element.points.map((point) => resolveDisplayScalar(point.x, bindings, tokens))),
              y1: Math.min(...element.points.map((point) => resolveDisplayScalar(point.y, bindings, tokens))),
              x2: Math.max(...element.points.map((point) => resolveDisplayScalar(point.x, bindings, tokens))),
              y2: Math.max(...element.points.map((point) => resolveDisplayScalar(point.y, bindings, tokens))),
              shade: 15, fill: false, smooth: false,
            }
        : elementCommands[0]!
      findings.push(...boundsFindings(document, boundsCommand, element.id, elementIndex))
      continue
    }
    if (!resolveDisplayVisibility(element.visible, bindings)) continue
    const symbol = document.symbols.find(({ id }) => id === element.symbolId)
    const variant = resolveInstanceVariant(element, document, bindings)
    if (!symbol || !variant) continue
    const translation = {
      x: resolveDisplayScalar(element.x, bindings, tokens),
      y: resolveDisplayScalar(element.y, bindings, tokens),
    }
    for (const primitive of variant.elements) {
      const primitiveCommands = compileDisplayPrimitiveCommands(primitive, bindings, translation, tokens, displayFrame)
      if (primitiveCommands.length === 0) continue
      const primitiveFirstCommand = commands.length
      commands.push(...primitiveCommands)
      commandSources.push({
        elementId: element.id,
        symbolId: symbol.id,
        variantId: variant.id,
        primitiveId: primitive.id,
        firstCommand: primitiveFirstCommand,
        commandCount: primitiveCommands.length,
      })
      const boundsCommand: DrawCommand = primitive.kind === 'pixel-box'
        ? {
            kind: 'box',
            x1: translated(resolveDisplayScalar(primitive.x, bindings, tokens), translation.x, true),
            y1: translated(resolveDisplayScalar(primitive.y, bindings, tokens), translation.y, true),
            x2: translated(resolveDisplayScalar(primitive.x, bindings, tokens), translation.x, true) + primitive.width - 1,
            y2: translated(resolveDisplayScalar(primitive.y, bindings, tokens), translation.y, true) + primitive.height - 1,
            shade: 15, fill: true, smooth: false,
          }
        : primitive.kind === 'animated-line'
          ? {
              kind: 'line',
              x1: translated(resolveDisplayScalar(primitive.x1, bindings, tokens), translation.x, true),
              y1: translated(resolveDisplayScalar(primitive.y1, bindings, tokens), translation.y, true),
              x2: translated(resolveDisplayScalar(primitive.x2, bindings, tokens), translation.x, true),
              y2: translated(resolveDisplayScalar(primitive.y2, bindings, tokens), translation.y, true),
              shade: 15, smooth: false,
            }
        : primitive.kind === 'polygon'
          ? {
              kind: 'circle',
              x: translated(resolveDisplayScalar(primitive.x, bindings, tokens), translation.x, true),
              y: translated(resolveDisplayScalar(primitive.y, bindings, tokens), translation.y, true),
              radius: resolveDisplayScalar(primitive.radius, bindings, tokens),
              shade: 15, smooth: false,
            }
        : primitive.kind === 'bezier'
          ? {
              kind: 'box',
              x1: Math.min(...primitive.points.map((point) => translated(resolveDisplayScalar(point.x, bindings, tokens), translation.x, true))),
              y1: Math.min(...primitive.points.map((point) => translated(resolveDisplayScalar(point.y, bindings, tokens), translation.y, true))),
              x2: Math.max(...primitive.points.map((point) => translated(resolveDisplayScalar(point.x, bindings, tokens), translation.x, true))),
              y2: Math.max(...primitive.points.map((point) => translated(resolveDisplayScalar(point.y, bindings, tokens), translation.y, true))),
              shade: 15, fill: false, smooth: false,
            }
        : primitiveCommands[0]!
      findings.push(...boundsFindings(document, boundsCommand, element.id, elementIndex, {
        symbolId: symbol.id,
        variantId: variant.id,
        primitiveId: primitive.id,
      }))
    }
    const largestVariant = Math.max(0, ...symbol.variants.map((candidate) => candidate.elements.reduce((count, primitive) => (
      count + compileDisplayPrimitiveCommands(primitive, bindings, NO_TRANSLATION, tokens, displayFrame).length
    ), 0)))
    maximumVariantDrawCallCount += largestVariant
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
      maximumVariantDrawCallCount,
      smoothCallCount,
      generatedUtf8Bytes: sourceBuild.generatedUtf8Bytes,
      tokenReferenceCount: sourceBuild.tokenReferenceCount,
    },
  }
}
