import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rasterizeDistingText } from '../src/disting/emulation/display-font'
import type { DrawCommand } from '../src/disting/types'
import { DISPLAY_COMPONENT_RECIPES } from '../src/disting/workbench/display-designer/display-component-catalog'
import {
  DISPLAY_COMPONENT_CATEGORIES,
  materializeDisplayComponent,
  type DisplayComponentRecipe,
} from '../src/disting/workbench/display-designer/display-component-library'
import { compileDisplayDesign } from '../src/disting/workbench/display-designer/display-design-compiler'
import {
  createEmptyDisplayDesign,
  createSequentialDisplayDesignIdFactory,
} from '../src/disting/workbench/display-designer/display-design-model'

const root = fileURLToPath(new URL('../', import.meta.url))
export const DEFAULT_PIXEL_UI_SVG_PATH = resolve(root, 'design/disting-pixel-ui-components.svg')

const ARTBOARD_WIDTH = 4096
const PAGE_MARGIN = 32
const PIXEL_SCALE = 1
const MAX_COMPONENT_WIDTH = 1008
const VARIANT_COLUMN_GAP = 6
const VARIANT_LABEL_HEIGHT = 18
const COMPONENT_HEADER_HEIGHT = 40
const COMPONENT_PADDING = 8
const CATEGORY_HEADER_HEIGHT = 42

interface Pixel {
  x: number
  y: number
  shade: number
}

interface PixelRun {
  x: number
  y: number
  width: number
  shade: number
}

interface SvgPrimitive {
  name: string
  runs: PixelRun[]
}

interface SvgVariant {
  stateName: string
  stateValue: string
  primitives: SvgPrimitive[]
}

interface SvgComponent {
  recipe: DisplayComponentRecipe
  variants: SvgVariant[]
}

interface ComponentLayout {
  width: number
  height: number
  columns: number
  cellWidth: number
  rowHeight: number
}

function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function idPart(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9_-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'item'
}

function shadeColour(shade: number): string {
  const intensity = Math.min(15, Math.max(0, shade)) / 15
  const channel = (maximum: number) => Math.round(maximum * intensity).toString(16).padStart(2, '0')
  return `#${channel(2)}${channel(241)}${channel(239)}`
}

function commandPixels(command: DrawCommand): Pixel[] {
  const pixels: Pixel[] = []
  const put = (x: number, y: number, shade = command.shade) => pixels.push({ x, y, shade })
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    let x = x1
    let y = y1
    const dx = Math.abs(x2 - x1)
    const sx = x1 < x2 ? 1 : -1
    const dy = -Math.abs(y2 - y1)
    const sy = y1 < y2 ? 1 : -1
    let error = dx + dy
    while (true) {
      put(x, y)
      if (x === x2 && y === y2) break
      const doubled = 2 * error
      if (doubled >= dy) {
        error += dy
        x += sx
      }
      if (doubled <= dx) {
        error += dx
        y += sy
      }
    }
  }

  if (command.kind === 'line') {
    if (command.smooth) throw new Error('The pixel UI catalog contains an unsupported smooth line.')
    line(command.x1, command.y1, command.x2, command.y2)
  } else if (command.kind === 'box') {
    if (command.smooth) throw new Error('The pixel UI catalog contains an unsupported smooth box.')
    const left = Math.min(command.x1, command.x2)
    const top = Math.min(command.y1, command.y2)
    const right = Math.max(command.x1, command.x2)
    const bottom = Math.max(command.y1, command.y2)
    if (command.fill) {
      for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) put(x, y)
    } else {
      line(command.x1, command.y1, command.x2, command.y1)
      line(command.x2, command.y1, command.x2, command.y2)
      line(command.x2, command.y2, command.x1, command.y2)
      line(command.x1, command.y2, command.x1, command.y1)
    }
  } else if (command.kind === 'circle') {
    if (command.smooth) throw new Error('The pixel UI catalog contains an unsupported smooth circle.')
    let x = command.radius
    let y = 0
    let error = 1 - command.radius
    while (x >= y) {
      put(command.x + x, command.y + y)
      put(command.x + y, command.y + x)
      put(command.x - y, command.y + x)
      put(command.x - x, command.y + y)
      put(command.x - x, command.y - y)
      put(command.x - y, command.y - x)
      put(command.x + y, command.y - x)
      put(command.x + x, command.y - y)
      y += 1
      if (error < 0) error += 2 * y + 1
      else {
        x -= 1
        error += 2 * (y - x) + 1
      }
    }
  } else {
    for (const pixel of rasterizeDistingText(command.x, command.y, command.text, command.tiny, command.align)) {
      put(pixel.x, pixel.y, Math.round((command.shade * pixel.coverage) / 15))
    }
  }
  return pixels
}

function horizontalRuns(pixels: Pixel[], width: number, height: number): PixelRun[] {
  const resolved = new Map<string, Pixel>()
  for (const pixel of pixels) {
    if (pixel.x >= 0 && pixel.x < width && pixel.y >= 0 && pixel.y < height) {
      resolved.set(`${pixel.x},${pixel.y}`, pixel)
    }
  }
  const ordered = [...resolved.values()]
    .sort((left, right) => left.y - right.y || left.x - right.x)
  const runs: PixelRun[] = []
  for (const pixel of ordered) {
    const previous = runs.at(-1)
    if (previous && previous.y === pixel.y && previous.shade === pixel.shade && previous.x + previous.width === pixel.x) {
      previous.width += 1
    } else runs.push({ x: pixel.x, y: pixel.y, width: 1, shade: pixel.shade })
  }
  return runs
}

function exportVariant(recipe: DisplayComponentRecipe, stateIndex: number): SvgVariant {
  const state = recipe.states[stateIndex]!
  const scenarioId = `svg-export-state-${stateIndex}`
  const exportRecipe: DisplayComponentRecipe = {
    ...recipe,
    scenarios: [...recipe.scenarios, {
      id: scenarioId, name: state.name, state: state.value,
      values: recipe.scenarios.find((scenario) => scenario.state === state.value)?.values,
    }],
  }
  const document = { ...createEmptyDisplayDesign(`${recipe.name} · ${state.name}`), displayMode: 'full-screen' as const }
  const materialized = materializeDisplayComponent(
    document,
    exportRecipe,
    createSequentialDisplayDesignIdFactory(`svg-${recipe.id}-${stateIndex}`),
    { scenarioId, origin: { x: 0, y: 0 } },
  )
  if (!materialized.ok) throw new Error(`${recipe.name} / ${state.name}: ${materialized.findings.join(' ')}`)
  const compiled = compileDisplayDesign(materialized.document)
  const primitiveNames = new Map(
    materialized.symbol.variants.flatMap((variant) => variant.elements.map((primitive) => [primitive.id, primitive.name] as const)),
  )
  const primitives = compiled.commandSources.map((source, index) => {
    const commands = compiled.commands.slice(source.firstCommand, source.firstCommand + source.commandCount)
    return {
      name: primitiveNames.get(source.primitiveId ?? '') ?? `Primitive ${index + 1}`,
      runs: horizontalRuns(commands.flatMap(commandPixels), recipe.footprint.width, recipe.footprint.height),
    }
  })
  return { stateName: state.name, stateValue: state.value, primitives }
}

function variantSvg(component: SvgComponent, variant: SvgVariant, x: number, y: number, index: number): string {
  const { recipe } = component
  const componentId = idPart(recipe.id)
  const stateId = idPart(variant.stateValue)
  const primitiveGroups = variant.primitives.map((primitive, primitiveIndex) => {
    const rectangles = primitive.runs.map((run) => (
      `<rect x="${run.x}" y="${run.y}" width="${run.width}" height="1" fill="${shadeColour(run.shade)}" data-shade="${run.shade}"/>`
    )).join('')
    return `<g id="${componentId}--${stateId}--primitive-${primitiveIndex + 1}" data-name="${xml(primitive.name)}">${rectangles}</g>`
  }).join('')
  return [
    `<g id="${componentId}--${stateId}" data-name="${xml(recipe.name)} / ${xml(variant.stateName)}" data-component-id="${xml(recipe.id)}" data-state="${xml(variant.stateValue)}">`,
    `<title>${xml(recipe.name)} / ${xml(variant.stateName)}</title>`,
    `<text x="${x}" y="${y + 15}" class="variant-label">${index + 1}. ${xml(variant.stateName)}</text>`,
    `<g transform="translate(${x} ${y + VARIANT_LABEL_HEIGHT}) scale(${PIXEL_SCALE})">`,
    `<rect data-name="Background" width="${recipe.footprint.width}" height="${recipe.footprint.height}" fill="#000000"/>`,
    `<g data-name="Pixel artwork" shape-rendering="crispEdges">${primitiveGroups}</g>`,
    `<rect data-name="Frame" x="-0.25" y="-0.25" width="${recipe.footprint.width + 0.5}" height="${recipe.footprint.height + 0.5}" fill="none" stroke="#235451" stroke-width="0.5"/>`,
    '</g></g>',
  ].join('')
}

function componentLayout(component: SvgComponent): ComponentLayout {
  const labelWidth = Math.max(...component.variants.map((variant) => (variant.stateName.length + 4) * 8))
  const cellWidth = Math.max(112, labelWidth, component.recipe.footprint.width * PIXEL_SCALE + 10)
  const columns = Math.max(1, Math.min(
    component.variants.length,
    Math.floor((MAX_COMPONENT_WIDTH - COMPONENT_PADDING * 2 + VARIANT_COLUMN_GAP) / (cellWidth + VARIANT_COLUMN_GAP)),
  ))
  const rows = Math.ceil(component.variants.length / columns)
  const rowHeight = VARIANT_LABEL_HEIGHT + component.recipe.footprint.height * PIXEL_SCALE + 10
  return {
    width: COMPONENT_PADDING * 2 + columns * cellWidth + (columns - 1) * VARIANT_COLUMN_GAP,
    height: COMPONENT_HEADER_HEIGHT + rows * rowHeight + COMPONENT_PADDING,
    columns,
    cellWidth,
    rowHeight,
  }
}

function componentSvg(component: SvgComponent, x: number, y: number): string {
  const { recipe } = component
  const layout = componentLayout(component)
  const variants = component.variants.map((variant, index) => {
    const column = index % layout.columns
    const row = Math.floor(index / layout.columns)
    const variantX = x + COMPONENT_PADDING + column * (layout.cellWidth + VARIANT_COLUMN_GAP)
    const variantY = y + COMPONENT_HEADER_HEIGHT + row * layout.rowHeight
    return variantSvg(component, variant, variantX, variantY, index)
  }).join('')
  return [
    `<g id="component-${idPart(recipe.id)}" data-name="${xml(recipe.name)}" data-category="${recipe.category}" data-footprint="${recipe.footprint.width}x${recipe.footprint.height}">`,
    `<title>${xml(recipe.name)} — ${xml(recipe.description)}</title>`,
    `<rect x="${x}" y="${y}" width="${layout.width}" height="${layout.height}" rx="6" fill="#0a1514" stroke="#17302e"/>`,
    `<text x="${x + COMPONENT_PADDING}" y="${y + 15}" class="component-title">${xml(recipe.name)}</text>`,
    `<text x="${x + COMPONENT_PADDING}" y="${y + 31}" class="component-meta">${xml(recipe.id)} · ${recipe.footprint.width}×${recipe.footprint.height} px · ${recipe.states.length} states</text>`,
    variants,
    '</g>',
  ].join('')
}

export function generateDisplayComponentLibrarySvg(): string {
  const components: SvgComponent[] = DISPLAY_COMPONENT_RECIPES.map((recipe) => ({
    recipe,
    variants: recipe.states.map((_, index) => exportVariant(recipe, index)),
  }))
  const variantCount = components.reduce((sum, component) => sum + component.variants.length, 0)
  let y = 142
  const sections: string[] = []
  for (const category of DISPLAY_COMPONENT_CATEGORIES) {
    const categoryComponents = components.filter(({ recipe }) => recipe.category === category.id)
    sections.push(`<g id="category-${category.id}" data-name="${xml(category.label)}">`)
    sections.push(`<rect x="0" y="${y}" width="${ARTBOARD_WIDTH}" height="${CATEGORY_HEADER_HEIGHT - 6}" fill="#102322"/>`)
    sections.push(`<text x="${PAGE_MARGIN}" y="${y + 25}" class="category-title">${xml(category.label)}</text>`)
    sections.push(`<text x="${ARTBOARD_WIDTH - PAGE_MARGIN}" y="${y + 24}" text-anchor="end" class="category-meta">${categoryComponents.length} components</text>`)
    y += CATEGORY_HEADER_HEIGHT
    let x = PAGE_MARGIN
    let rowY = y
    let rowHeight = 0
    for (const component of categoryComponents) {
      const layout = componentLayout(component)
      if (x > PAGE_MARGIN && x + layout.width > ARTBOARD_WIDTH - PAGE_MARGIN) {
        x = PAGE_MARGIN
        rowY += rowHeight + 8
        rowHeight = 0
      }
      sections.push(componentSvg(component, x, rowY))
      x += layout.width + 8
      rowHeight = Math.max(rowHeight, layout.height)
    }
    y = rowY + rowHeight + 16
    sections.push('</g>')
  }
  const height = y + PAGE_MARGIN
  const palette = Array.from({ length: 16 }, (_, shade) => (
    `<g data-name="Shade ${shade}" transform="translate(${PAGE_MARGIN + shade * 68} 104)"><rect width="56" height="20" fill="${shadeColour(shade)}" stroke="#235451"/><text x="28" y="35" text-anchor="middle" class="palette-label">${shade}</text></g>`
  )).join('')
  const metadata = JSON.stringify({
    title: 'Luading Disting NT pixel UI components',
    componentCount: components.length,
    variantCount,
    logicalPixelScale: PIXEL_SCALE,
    source: 'src/disting/workbench/display-designer/display-component-catalog.ts',
  })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ARTBOARD_WIDTH}" height="${height}" viewBox="0 0 ${ARTBOARD_WIDTH} ${height}">`,
    `<title>Luading Disting NT pixel UI components — ${components.length} components, ${variantCount} variants</title>`,
    `<metadata>${xml(metadata)}</metadata>`,
    '<style>',
    'text{font-family:Inter,ui-sans-serif,system-ui,sans-serif;fill:#d7efed}.page-title{font-size:28px;font-weight:700}.page-meta{font-size:13px;fill:#8cb5b1}.category-title{font-size:20px;font-weight:700;fill:#02f1ef}.category-meta,.component-meta{font-size:12px;fill:#729a96}.component-title{font-size:15px;font-weight:700}.variant-label{font-size:12px;fill:#accbc8}.palette-label{font-size:10px;fill:#729a96}',
    '</style>',
    `<rect width="${ARTBOARD_WIDTH}" height="${height}" fill="#08100f"/>`,
    `<g id="document-header" data-name="Document header"><text x="${PAGE_MARGIN}" y="48" class="page-title">Luading · Disting NT pixel UI components</text><text x="${PAGE_MARGIN}" y="74" class="page-meta">${components.length} components · ${variantCount} declared state variants · artwork shown at ${PIXEL_SCALE}× logical pixel scale · import this SVG directly into Figma</text></g>`,
    `<g id="disting-16-shade-palette" data-name="Disting 16-shade palette">${palette}</g>`,
    ...sections,
    '</svg>',
    '',
  ].join('\n')
}

export function writeDisplayComponentLibrarySvg(outputPath = DEFAULT_PIXEL_UI_SVG_PATH): string {
  const svg = generateDisplayComponentLibrarySvg()
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, svg, 'utf8')
  return outputPath
}
