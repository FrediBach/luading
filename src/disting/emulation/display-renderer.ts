import { DISTING_DISPLAY, type DrawCommand, type TextAlignment } from '../types'

const TINY_FONT: Record<string, string[]> = {
  ' ': ['000', '000', '000', '000', '000'],
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['101', '111', '111', '111', '101'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '111', '011'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['110', '001', '010', '100', '111'],
  '3': ['110', '001', '010', '001', '110'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '110', '001', '110'],
  '6': ['011', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '110'],
  '.': ['000', '000', '000', '000', '010'],
  ',': ['000', '000', '000', '010', '100'],
  ':': ['000', '010', '000', '010', '000'],
  ';': ['000', '010', '000', '010', '100'],
  '-': ['000', '000', '111', '000', '000'],
  '+': ['000', '010', '111', '010', '000'],
  '/': ['001', '001', '010', '100', '100'],
  '%': ['101', '001', '010', '100', '101'],
  '(': ['010', '100', '100', '100', '010'],
  ')': ['010', '001', '001', '001', '010'],
  '[': ['110', '100', '100', '100', '110'],
  ']': ['011', '001', '001', '001', '011'],
  '<': ['001', '010', '100', '010', '001'],
  '>': ['100', '010', '001', '010', '100'],
  '=': ['000', '111', '000', '111', '000'],
  '_': ['000', '000', '000', '000', '111'],
  '?': ['110', '001', '010', '000', '010'],
  '!': ['010', '010', '010', '000', '010'],
  "'": ['010', '010', '000', '000', '000'],
  '"': ['101', '101', '000', '000', '000'],
}

function shadeStyle(shade: number) {
  const intensity = Math.round((Math.min(15, Math.max(0, shade)) / 15) * 255)
  return `rgb(${intensity}, ${intensity}, ${intensity})`
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

function textStart(x: number, width: number, align: TextAlignment) {
  if (align === 'centre') return Math.round(x - width / 2)
  if (align === 'right') return x - width
  return x
}

function drawTinyText(
  context: CanvasRenderingContext2D,
  x: number,
  baseline: number,
  text: string,
  align: TextAlignment,
) {
  const glyphWidth = 3
  const advance = 4
  const width = text.length === 0 ? 0 : text.length * advance - 1
  const startX = textStart(x, width, align)
  const startY = baseline - 4

  Array.from(text).forEach((character, characterIndex) => {
    const glyph = TINY_FONT[character.toUpperCase()] ?? TINY_FONT['?']
    glyph.forEach((row, rowIndex) => {
      for (let column = 0; column < glyphWidth; column += 1) {
        if (row[column] === '1') {
          putPixel(context, startX + characterIndex * advance + column, startY + rowIndex)
        }
      }
    })
  })
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

  if (command.tiny) {
    drawTinyText(context, command.x, command.y, command.text, command.align)
  } else {
    context.font = '8px Arial, sans-serif'
    context.textBaseline = 'alphabetic'
    context.textAlign = command.align === 'centre' ? 'center' : command.align
    context.fillText(command.text, command.x, command.y)
  }
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
