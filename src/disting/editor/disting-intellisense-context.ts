import type { DistingConstantCategory } from '../validation/api-manifest'
import type { LuaSourceIndex } from '../validation/source-index'
import type { SourceRange } from '../validation/types'

export type DistingCompletionContext =
  | { kind: 'suppressed' }
  | { kind: 'empty-document' }
  | { kind: 'member'; owner: string }
  | { kind: 'top-level' }
  | { kind: 'init' }
  | { kind: 'constant-category'; category: DistingConstantCategory }
  | { kind: 'parameter-list' }
  | { kind: 'choices'; choices: readonly string[]; detail: string }
  | { kind: 'general' }

export interface ActiveLuaCall {
  name: string
  argumentIndex: number
  argumentText: string
}

type MaskResult = {
  masked: string
  suppressedRanges: Array<[number, number]>
}

function longBracket(source: string, start: number) {
  const opening = source.slice(start).match(/^\[(=*)\[/)
  if (!opening) return undefined
  const close = `]${opening[1]}]`
  const closeStart = source.indexOf(close, start + opening[0].length)
  return closeStart < 0
    ? { end: source.length, closed: false }
    : { end: closeStart + close.length, closed: true }
}

function maskLua(source: string): MaskResult {
  const result = source.split('')
  const suppressedRanges: Array<[number, number]> = []
  let index = 0

  const suppress = (start: number, end: number, cursorEnd = end) => {
    suppressedRanges.push([start, cursorEnd])
    for (let cursor = start; cursor < end; cursor += 1) {
      if (result[cursor] !== '\n') result[cursor] = ' '
    }
  }

  while (index < source.length) {
    if (source.startsWith('--', index)) {
      const long = longBracket(source, index + 2)
      const end = long?.end ?? (() => {
        const newline = source.indexOf('\n', index + 2)
        return newline < 0 ? source.length : newline
      })()
      suppress(index, end, long?.closed === false || !long ? end + 1 : end)
      index = end
      continue
    }

    const character = source[index]
    if (character === '"' || character === "'") {
      const start = index
      index += 1
      let closed = false
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2
          continue
        }
        index += 1
        if (source[index - 1] === character) {
          closed = true
          break
        }
      }
      suppress(start, index, closed ? index : index + 1)
      continue
    }

    if (character === '[') {
      const long = longBracket(source, index)
      if (long !== undefined) {
        suppress(index, long.end, long.closed ? long.end : long.end + 1)
        index = long.end
        continue
      }
    }
    index += 1
  }

  return { masked: result.join(''), suppressedRanges }
}

function offsetAt(source: string, line: number, column: number) {
  let offset = 0
  for (let currentLine = 1; currentLine < line; currentLine += 1) {
    const newline = source.indexOf('\n', offset)
    if (newline < 0) return source.length
    offset = newline + 1
  }
  return Math.min(source.length, offset + Math.max(0, column - 1))
}

function rangeOffsets(source: string, range: SourceRange) {
  return {
    start: offsetAt(source, range.startLine, range.startColumn),
    end: offsetAt(source, range.endLine, range.endColumn),
  }
}

function containsOffset(source: string, range: SourceRange | undefined, offset: number) {
  if (!range) return false
  const bounds = rangeOffsets(source, range)
  return offset >= bounds.start && offset <= bounds.end
}

function functionNameBefore(masked: string, openingOffset: number) {
  return masked.slice(0, openingOffset)
    .match(/([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*$/)?.[1]
}

export function activeLuaCallAt(source: string, offset: number): ActiveLuaCall | undefined {
  const { masked } = maskLua(source)
  const stack: Array<{
    opener: '(' | '[' | '{'
    callName?: string
    argumentIndex: number
    argumentStart: number
  }> = []
  const closing: Record<string, '(' | '[' | '{'> = { ')': '(', ']': '[', '}': '{' }

  for (let index = 0; index < Math.min(offset, masked.length); index += 1) {
    const character = masked[index]
    if (character === '(' || character === '[' || character === '{') {
      stack.push({
        opener: character,
        callName: character === '(' ? functionNameBefore(masked, index) : undefined,
        argumentIndex: 0,
        argumentStart: index + 1,
      })
    } else if (character === ')' || character === ']' || character === '}') {
      const expected = closing[character]
      while (stack.length > 0) {
        const entry = stack.pop()
        if (entry?.opener === expected) break
      }
    } else if (character === ',' && stack.at(-1)?.opener === '(') {
      const entry = stack.at(-1)!
      entry.argumentIndex += 1
      entry.argumentStart = index + 1
    }
  }

  const call = stack.findLast((entry) => entry.callName)
  return call?.callName ? {
    name: call.callName,
    argumentIndex: call.argumentIndex,
    argumentText: source.slice(call.argumentStart, offset).trim(),
  } : undefined
}

function delimitedArgumentIndex(source: string, start: number, offset: number) {
  const { masked } = maskLua(source)
  const opener = masked[start]
  const stack: string[] = [opener]
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
  let argumentIndex = 0
  for (let index = start + 1; index < Math.min(offset, masked.length); index += 1) {
    const character = masked[index]
    if (character === '(' || character === '[' || character === '{') stack.push(character)
    else if (character === ')' || character === ']' || character === '}') {
      if (stack.at(-1) === pairs[character]) stack.pop()
    } else if (character === ',' && stack.length === 1) argumentIndex += 1
  }
  return argumentIndex
}

function ownerBeforeOffset(masked: string, offset: number) {
  return masked.slice(0, offset).match(/([A-Za-z_]\w*)\.\w*$/)?.[1]
}

function isInsideExistingField(
  source: string,
  fields: readonly { valueRange: SourceRange }[],
  offset: number,
) {
  return fields.some((field) => containsOffset(source, field.valueRange, offset))
}

const MIDI_MESSAGES = [
  'note',
  'cc',
  'bend',
  'aftertouch',
  'poly pressure',
  'program change',
] as const

const DISPLAY_MODES = ['overview', 'meters', 'parameters', 'ui', 'algorithm', 'menu'] as const
const TEXT_ALIGNMENTS = ['left', 'centre', 'right'] as const

export function completionContextAt(
  source: string,
  offset: number,
  index: LuaSourceIndex,
): DistingCompletionContext {
  const lexical = maskLua(source)
  if (lexical.suppressedRanges.some(([start, end]) => offset > start && offset < end)) {
    return { kind: 'suppressed' }
  }
  if (source.trim().length === 0) return { kind: 'empty-document' }

  const call = activeLuaCallAt(source, offset)
  if (call?.name === 'setDisplayMode' && call.argumentIndex === 0) {
    return { kind: 'choices', choices: DISPLAY_MODES, detail: 'disting NT display mode' }
  }
  if ((call?.name === 'drawText' || call?.name === 'drawTinyText') && call.argumentIndex === 4) {
    return { kind: 'choices', choices: TEXT_ALIGNMENTS, detail: 'disting NT text alignment' }
  }

  if (containsOffset(source, index.semanticLocations['init.midi.messages'], offset)) {
    return { kind: 'choices', choices: MIDI_MESSAGES, detail: 'disting NT MIDI message filter' }
  }
  if (containsOffset(source, index.semanticLocations['init.inputs'], offset)) {
    return { kind: 'constant-category', category: 'input-type' }
  }
  if (containsOffset(source, index.semanticLocations['init.outputs'], offset)) {
    return { kind: 'constant-category', category: 'output-mode' }
  }

  const parameter = index.parameters.find((entry) => containsOffset(source, entry.range, offset))
  if (parameter) {
    const start = rangeOffsets(source, parameter.range).start
    const activeField = delimitedArgumentIndex(source, start, offset)
    if (!parameter.fields.enum && activeField === 4) {
      return { kind: 'constant-category', category: 'parameter-unit' }
    }
    if (!parameter.fields.enum && activeField === 5) {
      return { kind: 'constant-category', category: 'parameter-scale' }
    }
  }

  if (
    containsOffset(source, index.semanticLocations['init.parameters-table'], offset)
    && !parameter
  ) return { kind: 'parameter-list' }

  if (
    containsOffset(source, index.semanticLocations['init-table'], offset)
    && !isInsideExistingField(source, index.initFields, offset)
  ) return { kind: 'init' }

  if (
    containsOffset(source, index.semanticLocations['top-level-table'], offset)
    && !isInsideExistingField(source, index.topLevelFields, offset)
  ) return { kind: 'top-level' }

  const owner = ownerBeforeOffset(lexical.masked, offset)
  if (owner) return { kind: 'member', owner }
  return { kind: 'general' }
}

export function selfParameterReferenceAt(source: string, offset: number) {
  const { masked } = maskLua(source)
  const expression = /self\s*\.\s*parameters\s*\[\s*(\d+)\s*\]/g
  for (const match of masked.matchAll(expression)) {
    const start = match.index
    const end = start + match[0].length
    if (offset >= start && offset <= end) {
      return { index: Number(match[1]), start, end }
    }
  }
  return undefined
}
