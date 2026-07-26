import { DISTING_DISPLAY, type DrawCommand, type TextAlignment } from '../types'
import { rasterizeDistingText } from './display-font'

const DISPLAY_COLOUR = { red: 2, green: 241, blue: 239 } as const

function shadeStyle(shade: number) {
  const intensity = Math.min(15, Math.max(0, shade)) / 15
  const red = Math.round(DISPLAY_COLOUR.red * intensity)
  const green = Math.round(DISPLAY_COLOUR.green * intensity)
  const blue = Math.round(DISPLAY_COLOUR.blue * intensity)
  return `rgb(${red}, ${green}, ${blue})`
}

function putPixel(context: CanvasRenderingContext2D, x: number, y: number) {
  if (x < 0 || x >= DISTING_DISPLAY.width || y < 0 || y >= DISTING_DISPLAY.height) return
  context.fillRect(x, y, 1, 1)
}

function drawPixelLine(
  context: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  let x = x1
  let y = y1
  const dx = Math.abs(x2 - x1)
  const sx = x1 < x2 ? 1 : -1
  const dy = -Math.abs(y2 - y1)
  const sy = y1 < y2 ? 1 : -1
  let error = dx + dy

  while (true) {
    putPixel(context, x, y)
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

function drawPixelCircle(
  context: CanvasRenderingContext2D,
  centreX: number,
  centreY: number,
  radius: number,
) {
  let x = radius
  let y = 0
  let error = 1 - radius

  while (x >= y) {
    putPixel(context, centreX + x, centreY + y)
    putPixel(context, centreX + y, centreY + x)
    putPixel(context, centreX - y, centreY + x)
    putPixel(context, centreX - x, centreY + y)
    putPixel(context, centreX - x, centreY - y)
    putPixel(context, centreX - y, centreY - x)
    putPixel(context, centreX + y, centreY - x)
    putPixel(context, centreX + x, centreY - y)
    y += 1
    if (error < 0) {
      error += 2 * y + 1
    } else {
      x -= 1
      error += 2 * (y - x) + 1
    }
  }
}

function drawText(
  context: CanvasRenderingContext2D,
  x: number,
  baseline: number,
  text: string,
  tiny: boolean,
  align: TextAlignment,
  shade: number,
) {
  for (const pixel of rasterizeDistingText(x, baseline, text, tiny, align)) {
    context.fillStyle = shadeStyle(Math.round((shade * pixel.coverage) / 15))
    putPixel(context, pixel.x, pixel.y)
  }
}

function renderCommand(context: CanvasRenderingContext2D, command: DrawCommand) {
  context.fillStyle = shadeStyle(command.shade)
  context.strokeStyle = shadeStyle(command.shade)

  if (command.kind === 'line') {
    if (command.smooth) {
      context.beginPath()
      context.moveTo(command.x1, command.y1)
      context.lineTo(command.x2, command.y2)
      context.stroke()
    } else {
      drawPixelLine(context, command.x1, command.y1, command.x2, command.y2)
    }
    return
  }

  if (command.kind === 'box') {
    if (command.smooth) {
      context.beginPath()
      context.moveTo(command.x1, command.y1)
      context.lineTo(command.x2, command.y1)
      context.lineTo(command.x2, command.y2)
      context.lineTo(command.x1, command.y2)
      context.closePath()
      context.stroke()
      return
    }

    const left = Math.min(command.x1, command.x2)
    const top = Math.min(command.y1, command.y2)
    const width = Math.abs(command.x2 - command.x1) + 1
    const height = Math.abs(command.y2 - command.y1) + 1
    if (command.fill) {
      context.fillRect(left, top, width, height)
    } else {
      drawPixelLine(context, command.x1, command.y1, command.x2, command.y1)
      drawPixelLine(context, command.x2, command.y1, command.x2, command.y2)
      drawPixelLine(context, command.x2, command.y2, command.x1, command.y2)
      drawPixelLine(context, command.x1, command.y2, command.x1, command.y1)
    }
    return
  }

  if (command.kind === 'circle') {
    if (command.smooth) {
      context.beginPath()
      context.arc(command.x, command.y, command.radius, 0, Math.PI * 2)
      context.stroke()
    } else {
      drawPixelCircle(context, command.x, command.y, command.radius)
    }
    return
  }

  drawText(
    context,
    command.x,
    command.y,
    command.text,
    command.tiny,
    command.align,
    command.shade,
  )
}

export function renderDistingDisplay(
  context: CanvasRenderingContext2D,
  commands: DrawCommand[],
) {
  context.save()
  context.imageSmoothingEnabled = false
  context.fillStyle = '#000'
  context.fillRect(0, 0, DISTING_DISPLAY.width, DISTING_DISPLAY.height)
  context.lineWidth = 1

  for (const command of commands) renderCommand(context, command)
  context.restore()
}
