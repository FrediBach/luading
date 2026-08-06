import type { DrawCommand, ParameterDefinition, TextAlignment } from '../types'

type LuaGlobals = {
  set(name: string, value: unknown): void
}

type DisplayResolvers = {
  algorithmName?: (algorithmIndex: unknown) => string | undefined
  parameter?: (
    algorithmIndex: unknown,
    parameterIndex: unknown,
  ) => { definition: ParameterDefinition; value: number } | undefined
}

const MAX_SHADE = 15

function numeric(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function integer(value: unknown) {
  return Math.trunc(numeric(value))
}

function shade(value: unknown = MAX_SHADE) {
  return Math.min(MAX_SHADE, Math.max(0, numeric(value, MAX_SHADE)))
}

function alignment(value: unknown): TextAlignment {
  return value === 'centre' || value === 'right' ? value : 'left'
}

function parameterValue(parameter: ParameterDefinition | undefined, value: number | undefined) {
  if (!parameter || value === undefined) return ''
  if (parameter.enumValues) {
    return parameter.enumValues[Math.round(value) - (parameter.enumOffset ?? 1)] ?? ''
  }
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(2)
  return parameter.unit ? `${formatted} ${parameter.unit}` : formatted
}

export function buildParameterLineCommands(name: string, value: string, yOffset = 0): DrawCommand[] {
  return [
    { kind: 'text', x: 2, y: 7 + yOffset, text: name, shade: 15, tiny: true, align: 'left' },
    { kind: 'text', x: 253, y: 7 + yOffset, text: value, shade: 15, tiny: true, align: 'right' },
    { kind: 'line', x1: 0, y1: 9 + yOffset, x2: 255, y2: 9 + yOffset, shade: 5, smooth: false },
  ]
}

export class DistingDisplayApi {
  private buffer: DrawCommand[] = []
  private standardLineRequested = false

  reset() {
    this.buffer = []
    this.standardLineRequested = false
  }

  get commands() {
    return this.buffer
  }

  requestStandardParameterLine() {
    this.standardLineRequested = true
  }

  showSystemScreen(mode: string, algorithm: string) {
    this.buffer.push(
      { kind: 'text', x: 128, y: 24, text: mode.toUpperCase(), shade: 8, tiny: true, align: 'centre' },
      { kind: 'text', x: 128, y: 39, text: algorithm, shade: 15, tiny: false, align: 'centre' },
    )
  }

  finish(
    suppressStandardLine: boolean,
    parameter: ParameterDefinition | undefined,
    value: number | undefined,
  ) {
    if (!suppressStandardLine || this.standardLineRequested) {
      this.drawParameterLine(parameter?.name ?? 'Lua Script', parameterValue(parameter, value), 0)
    }
    return this.commands
  }

  register(
    globals: LuaGlobals,
    onCall?: (name: string) => void,
    resolvers: DisplayResolvers = {},
  ) {
    globals.set('drawLine', (x1: unknown, y1: unknown, x2: unknown, y2: unknown, colour: unknown = MAX_SHADE) => {
      onCall?.('drawLine')
      this.buffer.push({
        kind: 'line',
        x1: integer(x1),
        y1: integer(y1),
        x2: integer(x2),
        y2: integer(y2),
        shade: shade(colour),
        smooth: false,
      })
    })

    globals.set('drawSmoothLine', (x1: unknown, y1: unknown, x2: unknown, y2: unknown, colour: unknown = MAX_SHADE) => {
      onCall?.('drawSmoothLine')
      this.buffer.push({
        kind: 'line',
        x1: numeric(x1),
        y1: numeric(y1),
        x2: numeric(x2),
        y2: numeric(y2),
        shade: shade(colour),
        smooth: true,
      })
    })

    globals.set('drawBox', (x1: unknown, y1: unknown, x2: unknown, y2: unknown, colour: unknown = MAX_SHADE) => {
      onCall?.('drawBox')
      this.buffer.push({
        kind: 'box',
        x1: integer(x1),
        y1: integer(y1),
        x2: integer(x2),
        y2: integer(y2),
        shade: shade(colour),
        fill: false,
        smooth: false,
      })
    })

    globals.set('drawSmoothBox', (x1: unknown, y1: unknown, x2: unknown, y2: unknown, colour: unknown = MAX_SHADE) => {
      onCall?.('drawSmoothBox')
      this.buffer.push({
        kind: 'box',
        x1: numeric(x1),
        y1: numeric(y1),
        x2: numeric(x2),
        y2: numeric(y2),
        shade: shade(colour),
        fill: false,
        smooth: true,
      })
    })

    globals.set('drawRectangle', (x1: unknown, y1: unknown, x2: unknown, y2: unknown, colour: unknown = MAX_SHADE) => {
      onCall?.('drawRectangle')
      this.buffer.push({
        kind: 'box',
        x1: integer(x1),
        y1: integer(y1),
        x2: integer(x2),
        y2: integer(y2),
        shade: shade(colour),
        fill: true,
        smooth: false,
      })
    })

    globals.set('drawCircle', (x: unknown, y: unknown, radius: unknown, colour: unknown = MAX_SHADE) => {
      onCall?.('drawCircle')
      this.buffer.push({
        kind: 'circle',
        x: integer(x),
        y: integer(y),
        radius: Math.abs(integer(radius)),
        shade: shade(colour),
        smooth: false,
      })
    })

    globals.set('drawSmoothCircle', (x: unknown, y: unknown, radius: unknown, colour: unknown = MAX_SHADE) => {
      onCall?.('drawSmoothCircle')
      this.buffer.push({
        kind: 'circle',
        x: numeric(x),
        y: numeric(y),
        radius: Math.abs(numeric(radius)),
        shade: shade(colour),
        smooth: true,
      })
    })

    globals.set('drawText', (x: unknown, y: unknown, text: unknown, colour: unknown = MAX_SHADE, align: unknown = 'left') => {
      onCall?.('drawText')
      this.buffer.push({
        kind: 'text',
        x: integer(x),
        y: integer(y),
        text: String(text),
        shade: shade(colour),
        tiny: false,
        align: alignment(align),
      })
    })

    globals.set('drawTinyText', (x: unknown, y: unknown, text: unknown, colour: unknown = MAX_SHADE, align: unknown = 'left') => {
      onCall?.('drawTinyText')
      this.buffer.push({
        kind: 'text',
        x: integer(x),
        y: integer(y),
        text: String(text),
        shade: shade(colour),
        tiny: true,
        align: alignment(align),
      })
    })

    globals.set('drawStandardParameterLine', () => {
      onCall?.('drawStandardParameterLine')
      this.requestStandardParameterLine()
    })

    globals.set('drawParameterLine', (
      algorithmIndex: unknown,
      parameterIndex: unknown,
      yOffset: unknown = 0,
    ) => {
      onCall?.('drawParameterLine')
      const parameter = resolvers.parameter?.(algorithmIndex, parameterIndex)
      this.drawParameterLine(
        parameter?.definition.name ?? 'Unknown parameter',
        parameterValue(parameter?.definition, parameter?.value),
        integer(yOffset),
      )
    })

    globals.set('drawAlgorithmUI', (algorithmIndex: unknown) => {
      onCall?.('drawAlgorithmUI')
      const name = resolvers.algorithmName?.(algorithmIndex) ?? 'Unknown algorithm'
      this.buffer.push(
        { kind: 'text', x: 128, y: 27, text: name, shade: 15, tiny: false, align: 'centre' },
        { kind: 'text', x: 128, y: 40, text: 'Simulated algorithm UI', shade: 7, tiny: true, align: 'centre' },
      )
    })
  }

  private drawParameterLine(name: string, value: string, yOffset: number) {
    this.buffer.unshift(...buildParameterLineCommands(name, value, yOffset))
  }
}
