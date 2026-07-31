import type {
  LuaSourceIndex,
  SourceIndexSymbol,
} from '../validation/source-index'
import type { SourceRange } from '../validation/types'

export type DistingDocumentSymbolKind = 'callback' | 'function' | 'metadata' | 'parameter'

export interface DistingDocumentSymbol {
  name: string
  detail: string
  kind: DistingDocumentSymbolKind
  range: SourceRange
  selectionRange: SourceRange
  children?: DistingDocumentSymbol[]
}

export interface DistingFoldingRange {
  startLine: number
  endLine: number
}

export interface ResolvedLocalSymbol {
  definition: SourceIndexSymbol
  references: SourceRange[]
}

type Identifier = {
  name: string
  start: number
  end: number
  range: SourceRange
}

const LUA_KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function',
  'goto', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then',
  'true', 'until', 'while',
])

function lineStarts(source: string) {
  const starts = [0]
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') starts.push(index + 1)
  }
  return starts
}

function positionAt(starts: readonly number[], offset: number) {
  let low = 0
  let high = starts.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (starts[middle] <= offset) low = middle + 1
    else high = middle
  }
  const lineIndex = Math.max(0, low - 1)
  return { line: lineIndex + 1, column: offset - starts[lineIndex] + 1 }
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

function rangeContainsOffset(source: string, range: SourceRange, offset: number) {
  const bounds = rangeOffsets(source, range)
  return offset >= bounds.start && offset <= bounds.end
}

function textAt(source: string, range: SourceRange) {
  const bounds = rangeOffsets(source, range)
  return source.slice(bounds.start, bounds.end)
}

function parameterName(source: string, range: SourceRange | undefined, index: number) {
  if (!range) return `Parameter ${index}`
  const name = textAt(source, range).trim().match(/^(["'])(.*)\1$/)?.[2]
  return name ? `Parameter ${index}: ${name}` : `Parameter ${index}`
}

function compareRanges(left: SourceRange, right: SourceRange) {
  return left.startLine - right.startLine || left.startColumn - right.startColumn
}

export function documentSymbolsForSource(
  source: string,
  index: LuaSourceIndex,
): DistingDocumentSymbol[] {
  const callbacks = index.callbacks.map((callback): DistingDocumentSymbol => {
    const field = index.topLevelFields.find((entry) => entry.name === callback.name)
    return {
      name: callback.name,
      detail: 'Disting lifecycle callback',
      kind: 'callback',
      range: field?.range ?? callback.range,
      selectionRange: field?.nameRange ?? callback.selectionRange,
    }
  })
  const functions = index.symbols.flatMap((symbol): DistingDocumentSymbol[] => (
    symbol.kind === 'function' && symbol.isLocal
      ? [{
          name: symbol.name,
          detail: 'Local function',
          kind: 'function',
          range: symbol.range,
          selectionRange: symbol.selectionRange,
        }]
      : []
  ))
  const topLevelMetadata = index.topLevelFields.flatMap((field): DistingDocumentSymbol[] => (
    field.name === 'name' || field.name === 'author'
      ? [{
          name: field.name,
          detail: 'Algorithm metadata',
          kind: 'metadata',
          range: field.range,
          selectionRange: field.nameRange,
        }]
      : []
  ))
  const initMetadata = index.initFields.map((field): DistingDocumentSymbol => ({
    name: field.name,
    detail: 'init() metadata',
    kind: 'metadata',
    range: field.range,
    selectionRange: field.nameRange,
    children: field.name === 'parameters'
      ? index.parameters.map((parameter): DistingDocumentSymbol => ({
          name: parameterName(source, parameter.fields.name, parameter.index),
          detail: 'Script parameter',
          kind: 'parameter',
          range: parameter.range,
          selectionRange: parameter.fields.name ?? parameter.range,
        }))
      : undefined,
  }))

  return [...callbacks, ...functions, ...topLevelMetadata, ...initMetadata]
    .sort((left, right) => compareRanges(left.range, right.range))
}

function foldForRange(range: SourceRange) {
  if (range.endLine - range.startLine < 2) return undefined
  return {
    startLine: range.startLine,
    endLine: range.endLine - 1,
  }
}

export function foldingRangesForSource(index: LuaSourceIndex): DistingFoldingRange[] {
  const candidates = [
    ...index.callbacks.map((callback) => callback.range),
    ...index.symbols.flatMap((symbol) => (
      symbol.kind === 'function' && symbol.isLocal ? [symbol.range] : []
    )),
    ...index.initFields.map((field) => field.range),
  ]
  const seen = new Set<string>()
  return candidates.flatMap((range) => {
    const fold = foldForRange(range)
    if (!fold) return []
    const key = `${fold.startLine}:${fold.endLine}`
    if (seen.has(key)) return []
    seen.add(key)
    return [fold]
  }).sort((left, right) => left.startLine - right.startLine || left.endLine - right.endLine)
}

function longBracketEnd(source: string, start: number) {
  const opening = source.slice(start).match(/^\[(=*)\[/)
  if (!opening) return undefined
  const closing = `]${opening[1]}]`
  const closeStart = source.indexOf(closing, start + opening[0].length)
  return closeStart < 0 ? source.length : closeStart + closing.length
}

function maskCommentsAndStrings(source: string) {
  const result = source.split('')
  const mask = (start: number, end: number) => {
    for (let offset = start; offset < end; offset += 1) {
      if (result[offset] !== '\n') result[offset] = ' '
    }
  }
  let offset = 0
  while (offset < source.length) {
    if (source.startsWith('--', offset)) {
      const longEnd = longBracketEnd(source, offset + 2)
      const newline = source.indexOf('\n', offset + 2)
      const end = longEnd ?? (newline < 0 ? source.length : newline)
      mask(offset, end)
      offset = end
      continue
    }
    const character = source[offset]
    if (character === '"' || character === "'") {
      const start = offset
      offset += 1
      while (offset < source.length) {
        if (source[offset] === '\\') {
          offset += 2
        } else if (source[offset] === character) {
          offset += 1
          break
        } else {
          offset += 1
        }
      }
      mask(start, offset)
      continue
    }
    if (character === '[') {
      const end = longBracketEnd(source, offset)
      if (end !== undefined) {
        mask(offset, end)
        offset = end
        continue
      }
    }
    offset += 1
  }
  return result.join('')
}

function significantCharacter(source: string, offset: number, direction: -1 | 1) {
  let cursor = offset
  while (cursor >= 0 && cursor < source.length && /\s/.test(source[cursor])) cursor += direction
  return source[cursor]
}

function isTableKey(masked: string, start: number, end: number) {
  const previous = significantCharacter(masked, start - 1, -1)
  const next = significantCharacter(masked, end, 1)
  return next === '=' && (previous === '{' || previous === ',' || previous === ';')
}

function identifiers(source: string) {
  const starts = lineStarts(source)
  const masked = maskCommentsAndStrings(source)
  return [...masked.matchAll(/[A-Za-z_]\w*/g)].flatMap((match): Identifier[] => {
    const name = match[0]
    const start = match.index
    const end = start + name.length
    if (LUA_KEYWORDS.has(name)) return []
    const previous = significantCharacter(masked, start - 1, -1)
    if (previous === '.' || previous === ':' || isTableKey(masked, start, end)) return []
    const before = masked.slice(0, start).match(/([A-Za-z_]\w*)\s*$/)?.[1]
    if (before === 'goto' || (masked.slice(Math.max(0, start - 2), start) === '::')) return []
    const from = positionAt(starts, start)
    const to = positionAt(starts, end)
    return [{
      name,
      start,
      end,
      range: {
        startLine: from.line,
        startColumn: from.column,
        endLine: to.line,
        endColumn: to.column,
      },
    }]
  })
}

function localSymbols(index: LuaSourceIndex, name: string) {
  return index.symbols.filter((symbol) => symbol.isLocal && symbol.name === name)
}

function resolvedDefinition(
  source: string,
  symbols: readonly SourceIndexSymbol[],
  offset: number,
) {
  const declaration = symbols.find((symbol) => rangeContainsOffset(source, symbol.selectionRange, offset))
  if (declaration) return declaration

  const visible = symbols.filter((symbol) => {
    const declared = rangeOffsets(source, symbol.selectionRange)
    return declared.start <= offset && rangeContainsOffset(source, symbol.scopeRange, offset)
  }).sort((left, right) => {
    const leftScope = rangeOffsets(source, left.scopeRange)
    const rightScope = rangeOffsets(source, right.scopeRange)
    return (leftScope.end - leftScope.start) - (rightScope.end - rightScope.start)
      || rangeOffsets(source, right.selectionRange).start - rangeOffsets(source, left.selectionRange).start
  })
  if (visible.length < 2) return visible[0]
  const firstScope = rangeOffsets(source, visible[0].scopeRange)
  const secondScope = rangeOffsets(source, visible[1].scopeRange)
  const firstDeclaration = rangeOffsets(source, visible[0].selectionRange)
  const secondDeclaration = rangeOffsets(source, visible[1].selectionRange)
  return firstScope.start === secondScope.start
    && firstScope.end === secondScope.end
    && firstDeclaration.start === secondDeclaration.start
    ? undefined
    : visible[0]
}

export function resolvedLocalSymbolAt(
  source: string,
  offset: number,
  index: LuaSourceIndex,
): ResolvedLocalSymbol | undefined {
  if (!index.complete) return undefined
  const indexedIdentifiers = identifiers(source)
  const identifier = indexedIdentifiers.find((entry) => offset >= entry.start && offset <= entry.end)
  if (!identifier) return undefined
  const candidates = localSymbols(index, identifier.name)
  const definition = resolvedDefinition(source, candidates, identifier.start)
  if (!definition) return undefined
  const references = indexedIdentifiers.flatMap((entry) => {
    if (entry.name !== definition.name) return []
    return resolvedDefinition(source, candidates, entry.start) === definition ? [entry.range] : []
  })
  return references.length > 0 ? { definition, references } : undefined
}

export function isValidLuaIdentifier(name: string) {
  return /^[A-Za-z_]\w*$/.test(name) && !LUA_KEYWORDS.has(name)
}
