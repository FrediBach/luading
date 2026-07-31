import {
  DISTING_API_BY_NAME,
  DISTING_LIFECYCLE_NAMES,
  type DistingLifecycleName,
} from './api-manifest'
import type { ScriptDiagnostic, SourceRange } from './types'

type Token = {
  value: string
  start: number
  end: number
}

type IndexedField = {
  name: string
  range: SourceRange
  nameRange: SourceRange
  valueRange: SourceRange
  valueStartIndex: number
  valueEndIndex: number
}

export interface SourceIndexField {
  name: string
  range: SourceRange
  nameRange: SourceRange
  valueRange: SourceRange
}

export interface SourceIndexCallback {
  name: DistingLifecycleName
  range: SourceRange
  selectionRange: SourceRange
}

export interface SourceIndexParameter {
  index: number
  range: SourceRange
  fields: Record<string, SourceRange>
}

export interface SourceIndexApiCall {
  name: string
  range: SourceRange
  nameRange: SourceRange
  argumentRanges: SourceRange[]
}

export interface SourceIndexSymbol {
  name: string
  kind: 'local' | 'function' | 'parameter'
  isLocal: boolean
  range: SourceRange
  selectionRange: SourceRange
  scopeRange: SourceRange
}

export interface LuaSourceIndex {
  version: number
  complete: boolean
  callbacks: SourceIndexCallback[]
  topLevelFields: SourceIndexField[]
  initFields: SourceIndexField[]
  parameters: SourceIndexParameter[]
  apiCalls: SourceIndexApiCall[]
  symbols: SourceIndexSymbol[]
  semanticLocations: Record<string, SourceRange>
}

type ScannerState = {
  source: string
  tokens: Token[]
  lineStarts: number[]
  symbolPairs: Map<number, number>
  blockPairs: Map<number, number>
  blockDepths: number[]
  complete: boolean
}

const LIFECYCLE_NAMES = new Set<string>(DISTING_LIFECYCLE_NAMES)
const SYMBOL_OPENERS = new Map([['(', ')'], ['[', ']'], ['{', '}']])
const SYMBOL_CLOSERS = new Set(SYMBOL_OPENERS.values())
const MULTI_CHARACTER_TOKENS = ['...', '::', '//', '<<', '>>', '<=', '>=', '==', '~=', '..']

function longBracket(source: string, start: number) {
  const opening = source.slice(start).match(/^\[(=*)\[/)
  if (!opening) return undefined
  const closing = `]${opening[1]}]`
  const closeStart = source.indexOf(closing, start + opening[0].length)
  return closeStart < 0
    ? { end: source.length, complete: false }
    : { end: closeStart + closing.length, complete: true }
}

function scanTokens(source: string) {
  const tokens: Token[] = []
  let complete = true
  let index = 0

  while (index < source.length) {
    const character = source[index]
    if (/\s/.test(character)) {
      index += 1
      continue
    }

    if (source.startsWith('--', index)) {
      const long = longBracket(source, index + 2)
      if (long) {
        complete &&= long.complete
        index = long.end
      } else {
        const lineEnd = source.indexOf('\n', index + 2)
        index = lineEnd < 0 ? source.length : lineEnd + 1
      }
      continue
    }

    if (character === '"' || character === "'") {
      const start = index
      const quote = character
      index += 1
      let closed = false
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2
          continue
        }
        if (source[index] === quote) {
          index += 1
          closed = true
          break
        }
        index += 1
      }
      complete &&= closed
      tokens.push({ value: source.slice(start, index), start, end: index })
      continue
    }

    if (character === '[') {
      const long = longBracket(source, index)
      if (long) {
        complete &&= long.complete
        tokens.push({ value: source.slice(index, long.end), start: index, end: long.end })
        index = long.end
        continue
      }
    }

    const identifier = source.slice(index).match(/^[A-Za-z_]\w*/)
    if (identifier) {
      tokens.push({ value: identifier[0], start: index, end: index + identifier[0].length })
      index += identifier[0].length
      continue
    }

    const number = source.slice(index).match(/^(?:0[xX][\dA-Fa-f]+(?:\.[\dA-Fa-f]*)?(?:[pP][+-]?\d+)?|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/)
    if (number) {
      tokens.push({ value: number[0], start: index, end: index + number[0].length })
      index += number[0].length
      continue
    }

    const operator = MULTI_CHARACTER_TOKENS.find((candidate) => source.startsWith(candidate, index))
    const value = operator ?? character
    tokens.push({ value, start: index, end: index + value.length })
    index += value.length
  }

  return { tokens, complete }
}

function lineStarts(source: string) {
  const starts = [0]
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') starts.push(index + 1)
  }
  return starts
}

function sourcePosition(starts: readonly number[], offset: number) {
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

function offsetRange(state: ScannerState, start: number, end: number): SourceRange {
  const from = sourcePosition(state.lineStarts, start)
  const to = sourcePosition(state.lineStarts, Math.max(start + 1, end))
  return {
    startLine: from.line,
    startColumn: from.column,
    endLine: to.line,
    endColumn: to.column,
  }
}

function tokenRange(state: ScannerState, token: Token) {
  return offsetRange(state, token.start, token.end)
}

function buildScannerState(source: string): ScannerState {
  const scanned = scanTokens(source)
  const symbolPairs = new Map<number, number>()
  const symbolStack: Array<{ value: string; index: number }> = []
  let complete = scanned.complete

  scanned.tokens.forEach((token, index) => {
    if (SYMBOL_OPENERS.has(token.value)) {
      symbolStack.push({ value: token.value, index })
      return
    }
    if (!SYMBOL_CLOSERS.has(token.value)) return
    const opening = symbolStack.pop()
    if (!opening || SYMBOL_OPENERS.get(opening.value) !== token.value) {
      complete = false
      return
    }
    symbolPairs.set(opening.index, index)
    symbolPairs.set(index, opening.index)
  })
  if (symbolStack.length > 0) complete = false

  const blockPairs = new Map<number, number>()
  const blockStack: Array<{ index: number; close: 'end' | 'until'; awaitingDo?: boolean }> = []
  const blockDepths: number[] = []
  scanned.tokens.forEach((token, index) => {
    blockDepths[index] = blockStack.length
    if (token.value === 'function' || token.value === 'if') {
      blockStack.push({ index, close: 'end' })
    } else if (token.value === 'for' || token.value === 'while') {
      blockStack.push({ index, close: 'end', awaitingDo: true })
    } else if (token.value === 'repeat') {
      blockStack.push({ index, close: 'until' })
    } else if (token.value === 'do') {
      const pendingLoop = [...blockStack].reverse().find((block) => block.awaitingDo)
      if (pendingLoop) pendingLoop.awaitingDo = false
      else blockStack.push({ index, close: 'end' })
    } else if (token.value === 'end' || token.value === 'until') {
      const opening = blockStack.at(-1)
      if (!opening || opening.close !== token.value) {
        complete = false
        return
      }
      blockStack.pop()
      blockPairs.set(opening.index, index)
      blockPairs.set(index, opening.index)
    }
  })
  if (blockStack.length > 0) complete = false

  return {
    source,
    tokens: scanned.tokens,
    lineStarts: lineStarts(source),
    symbolPairs,
    blockPairs,
    blockDepths,
    complete,
  }
}

function splitDelimited(
  state: ScannerState,
  openIndex: number,
  closeIndex: number,
) {
  const segments: Array<[number, number]> = []
  const baselineBlockDepth = state.blockDepths[openIndex] ?? 0
  let segmentStart = openIndex + 1
  let symbolDepth = 0

  for (let index = openIndex + 1; index < closeIndex; index += 1) {
    const value = state.tokens[index].value
    if (SYMBOL_OPENERS.has(value)) symbolDepth += 1
    else if (SYMBOL_CLOSERS.has(value)) symbolDepth -= 1
    if (
      symbolDepth === 0
      && (state.blockDepths[index] ?? 0) === baselineBlockDepth
      && (value === ',' || value === ';')
    ) {
      if (segmentStart < index) segments.push([segmentStart, index - 1])
      segmentStart = index + 1
    }
  }
  if (segmentStart < closeIndex) segments.push([segmentStart, closeIndex - 1])
  return segments
}

function namedTableFields(
  state: ScannerState,
  openIndex: number,
  closeIndex: number,
): IndexedField[] {
  return splitDelimited(state, openIndex, closeIndex).flatMap(([start, end]) => {
    const name = state.tokens[start]
    if (!name || !/^[A-Za-z_]\w*$/.test(name.value) || state.tokens[start + 1]?.value !== '=') return []
    const valueStartIndex = start + 2
    if (valueStartIndex > end) return []
    const last = state.tokens[end]
    const valueStart = state.tokens[valueStartIndex]
    return [{
      name: name.value,
      range: offsetRange(state, name.start, last.end),
      nameRange: tokenRange(state, name),
      valueRange: offsetRange(state, valueStart.start, last.end),
      valueStartIndex,
      valueEndIndex: end,
    }]
  })
}

function publicField(field: IndexedField): SourceIndexField {
  return {
    name: field.name,
    range: field.range,
    nameRange: field.nameRange,
    valueRange: field.valueRange,
  }
}

function returnTableCandidates(state: ScannerState, start = 0, end = state.tokens.length) {
  const candidates: Array<{ returnIndex: number; openIndex: number; closeIndex: number }> = []
  for (let index = start; index < end - 1; index += 1) {
    if (state.tokens[index].value !== 'return') continue
    const returned = state.tokens[index + 1]
    const openIndex = returned.value === '{'
      ? index + 1
      : assignedTable(state, returned.value, index, state.blockDepths[index] ?? 0)?.openIndex
    if (openIndex === undefined) continue
    const closeIndex = state.symbolPairs.get(openIndex)
    if (closeIndex !== undefined && closeIndex < end) {
      candidates.push({ returnIndex: index, openIndex, closeIndex })
    }
  }
  return candidates
}

function assignedTable(
  state: ScannerState,
  name: string,
  beforeIndex: number,
  blockDepth: number,
) {
  if (!/^[A-Za-z_]\w*$/.test(name)) return undefined
  let result: { openIndex: number; closeIndex: number; depth: number } | undefined
  for (let index = 0; index < beforeIndex - 2; index += 1) {
    const candidateDepth = state.blockDepths[index] ?? 0
    if (
      state.tokens[index].value !== name
      || state.tokens[index + 1].value !== '='
      || state.tokens[index + 2].value !== '{'
      || candidateDepth > blockDepth
    ) continue
    const closeIndex = state.symbolPairs.get(index + 2)
    if (
      closeIndex !== undefined
      && closeIndex < beforeIndex
      && (!result || candidateDepth >= result.depth)
    ) {
      result = { openIndex: index + 2, closeIndex, depth: candidateDepth }
    }
  }
  return result && { openIndex: result.openIndex, closeIndex: result.closeIndex }
}

function fieldTable(
  state: ScannerState,
  field: IndexedField,
) {
  const value = state.tokens[field.valueStartIndex]
  if (value?.value === '{') {
    const closeIndex = state.symbolPairs.get(field.valueStartIndex)
    return closeIndex === undefined
      ? undefined
      : { openIndex: field.valueStartIndex, closeIndex }
  }
  return assignedTable(
    state,
    value?.value ?? '',
    field.valueStartIndex,
    state.blockDepths[field.valueStartIndex] ?? 0,
  )
}

function shallowestReturnTable(
  state: ScannerState,
  start = 0,
  end = state.tokens.length,
) {
  return returnTableCandidates(state, start, end).sort((left, right) => (
    (state.blockDepths[left.returnIndex] ?? 0) - (state.blockDepths[right.returnIndex] ?? 0)
    || (right.closeIndex - right.openIndex) - (left.closeIndex - left.openIndex)
  ))[0]
}

function functionDefinitions(state: ScannerState) {
  const definitions = new Map<string, { functionIndex: number; closeIndex: number; nameIndex: number }>()
  const symbols: SourceIndexSymbol[] = []

  for (let index = 0; index < state.tokens.length; index += 1) {
    const token = state.tokens[index]
    if (token.value === 'function' && /^[A-Za-z_]\w*$/.test(state.tokens[index + 1]?.value ?? '')) {
      const nameIndex = index + 1
      const closeIndex = state.blockPairs.get(index)
      if (closeIndex === undefined) continue
      const name = state.tokens[nameIndex].value
      definitions.set(name, { functionIndex: index, closeIndex, nameIndex })
      symbols.push({
        name,
        kind: 'function',
        isLocal: state.tokens[index - 1]?.value === 'local',
        range: offsetRange(state, token.start, state.tokens[closeIndex].end),
        selectionRange: tokenRange(state, state.tokens[nameIndex]),
        scopeRange: declarationScope(state, state.tokens[index - 1]?.value === 'local' ? index - 1 : index),
      })
      continue
    }

    if (
      token.value === 'local'
      && /^[A-Za-z_]\w*$/.test(state.tokens[index + 1]?.value ?? '')
      && state.tokens[index + 2]?.value === '='
      && state.tokens[index + 3]?.value === 'function'
    ) {
      const nameIndex = index + 1
      const functionIndex = index + 3
      const closeIndex = state.blockPairs.get(functionIndex)
      if (closeIndex === undefined) continue
      const name = state.tokens[nameIndex].value
      definitions.set(name, { functionIndex, closeIndex, nameIndex })
      symbols.push({
        name,
        kind: 'function',
        isLocal: true,
        range: offsetRange(state, token.start, state.tokens[closeIndex].end),
        selectionRange: tokenRange(state, state.tokens[nameIndex]),
        scopeRange: declarationScope(state, index),
      })
      continue
    }

    if (token.value !== 'local' || state.tokens[index + 1]?.value === 'function') continue
    for (let cursor = index + 1; cursor < state.tokens.length; cursor += 1) {
      const candidate = state.tokens[cursor]
      if (candidate.value === '=' || candidate.value === ';') break
      if (/^[A-Za-z_]\w*$/.test(candidate.value)) {
        symbols.push({
          name: candidate.value,
          kind: 'local',
          isLocal: true,
          range: tokenRange(state, candidate),
          selectionRange: tokenRange(state, candidate),
          scopeRange: declarationScope(state, index),
        })
      }
      if (candidate.value !== ',' && cursor > index + 1) break
    }
  }
  symbols.push(...functionParameterSymbols(state))
  return { definitions, symbols }
}

function declarationScope(state: ScannerState, declarationIndex: number) {
  let containingClose: number | undefined
  let closestOpen = -1
  for (const [open, close] of state.blockPairs) {
    if (
      open >= declarationIndex
      || close <= declarationIndex
      || open < closestOpen
      || state.blockPairs.get(open) !== close
    ) continue
    closestOpen = open
    containingClose = close
  }
  const start = state.tokens[declarationIndex]?.start ?? 0
  const end = containingClose === undefined
    ? state.source.length
    : state.tokens[containingClose].end
  return offsetRange(state, start, end)
}

function functionParameterSymbols(state: ScannerState): SourceIndexSymbol[] {
  const symbols: SourceIndexSymbol[] = []
  state.tokens.forEach((token, functionIndex) => {
    if (token.value !== 'function') return
    const functionClose = state.blockPairs.get(functionIndex)
    if (functionClose === undefined) return
    let parametersOpen = functionIndex + 1
    while (
      parametersOpen < functionClose
      && state.tokens[parametersOpen].value !== '('
      && parametersOpen - functionIndex < 12
    ) parametersOpen += 1
    if (state.tokens[parametersOpen]?.value !== '(') return
    const parametersClose = state.symbolPairs.get(parametersOpen)
    if (parametersClose === undefined || parametersClose > functionClose) return
    const scopeRange = offsetRange(
      state,
      state.tokens[parametersClose].end,
      state.tokens[functionClose].end,
    )
    splitDelimited(state, parametersOpen, parametersClose).forEach(([start]) => {
      const parameter = state.tokens[start]
      if (!/^[A-Za-z_]\w*$/.test(parameter?.value ?? '')) return
      symbols.push({
        name: parameter.value,
        kind: 'parameter',
        isLocal: true,
        range: tokenRange(state, parameter),
        selectionRange: tokenRange(state, parameter),
        scopeRange,
      })
    })
  })
  return symbols
}

function callbackIndex(
  state: ScannerState,
  fields: IndexedField[],
  definitions: Map<string, { functionIndex: number; closeIndex: number; nameIndex: number }>,
) {
  const callbacks: SourceIndexCallback[] = []
  const functionBounds = new Map<string, { start: number; end: number }>()

  fields.forEach((field) => {
    if (!LIFECYCLE_NAMES.has(field.name)) return
    const value = state.tokens[field.valueStartIndex]
    let start = field.valueStartIndex
    let end = field.valueEndIndex
    if (value.value === 'function') {
      end = state.blockPairs.get(field.valueStartIndex) ?? end
      functionBounds.set(field.name, { start, end })
    } else if (/^[A-Za-z_]\w*$/.test(value.value)) {
      const definition = definitions.get(value.value)
      if (definition) {
        start = definition.functionIndex
        end = definition.closeIndex
        functionBounds.set(field.name, { start, end })
      }
    }
    callbacks.push({
      name: field.name as DistingLifecycleName,
      range: offsetRange(state, state.tokens[start].start, state.tokens[end].end),
      selectionRange: field.nameRange,
    })
  })
  return { callbacks, functionBounds }
}

function indexParameters(
  state: ScannerState,
  field: IndexedField | undefined,
  semanticLocations: Record<string, SourceRange>,
) {
  if (!field) return []
  const table = fieldTable(state, field)
  if (!table) return []

  return splitDelimited(state, table.openIndex, table.closeIndex).flatMap(([start, end], parameterIndex) => {
    if (state.tokens[start]?.value !== '{') return []
    const definitionClose = state.symbolPairs.get(start)
    if (definitionClose === undefined || definitionClose > end) return []
    const elements = splitDelimited(state, start, definitionClose)
    const fields: Record<string, SourceRange> = {}
    const elementRange = (index: number) => {
      const element = elements[index]
      return element
        ? offsetRange(state, state.tokens[element[0]].start, state.tokens[element[1]].end)
        : undefined
    }
    const assign = (name: string, elementIndex: number) => {
      const range = elementRange(elementIndex)
      if (range) fields[name] = range
    }
    assign('name', 0)
    const secondElement = elements[1]
    const enumDefinition = secondElement && state.tokens[secondElement[0]]?.value === '{'
    if (enumDefinition) {
      assign('enum', 1)
      assign('default', 2)
    } else {
      assign('minimum', 1)
      assign('maximum', 2)
      assign('default', 3)
      assign('unit', 4)
      assign('scale', 5)
    }
    const range = offsetRange(state, state.tokens[start].start, state.tokens[definitionClose].end)
    const number = parameterIndex + 1
    semanticLocations[`parameters[${number}]`] = range
    Object.entries(fields).forEach(([name, location]) => {
      semanticLocations[`parameters[${number}].${name}`] = location
    })
    return [{ index: number, range, fields }]
  })
}

function indexApiCalls(state: ScannerState, semanticLocations: Record<string, SourceRange>) {
  const calls: SourceIndexApiCall[] = []
  for (let index = 0; index < state.tokens.length - 1; index += 1) {
    const name = state.tokens[index]
    if (!DISTING_API_BY_NAME.has(name.value) || state.tokens[index + 1].value !== '(') continue
    const close = state.symbolPairs.get(index + 1)
    if (close === undefined) continue
    const argumentRanges = splitDelimited(state, index + 1, close).map(([start, end]) => (
      offsetRange(state, state.tokens[start].start, state.tokens[end].end)
    ))
    const call = {
      name: name.value,
      range: offsetRange(state, name.start, state.tokens[close].end),
      nameRange: tokenRange(state, name),
      argumentRanges,
    }
    calls.push(call)
    semanticLocations[`api-call:${name.value}`] ??= call.nameRange
  }
  return calls
}

function createEmptyIndex(version: number): LuaSourceIndex {
  return {
    version,
    complete: false,
    callbacks: [],
    topLevelFields: [],
    initFields: [],
    parameters: [],
    apiCalls: [],
    symbols: [],
    semanticLocations: {},
  }
}

export function createLuaSourceIndex(source: string, version: number): LuaSourceIndex {
  try {
    const state = buildScannerState(source)
    const root = shallowestReturnTable(state)
    const semanticLocations: Record<string, SourceRange> = {}
    const { definitions, symbols } = functionDefinitions(state)
    const rootFields = root ? namedTableFields(state, root.openIndex, root.closeIndex) : []
    if (root) {
      semanticLocations['top-level'] = tokenRange(state, state.tokens[root.returnIndex])
      semanticLocations['top-level-table'] = offsetRange(
        state,
        state.tokens[root.openIndex].start,
        state.tokens[root.closeIndex].end,
      )
    }
    rootFields.forEach((field) => {
      semanticLocations[`topLevel:${field.name}`] = field.valueRange
    })

    const { callbacks, functionBounds } = callbackIndex(state, rootFields, definitions)
    callbacks.forEach((callback) => {
      semanticLocations[`callback:${callback.name}`] = callback.selectionRange
    })

    const initBounds = functionBounds.get('init')
    const initTable = initBounds
      ? shallowestReturnTable(state, initBounds.start + 1, initBounds.end)
      : undefined
    const initFields = initTable
      ? namedTableFields(state, initTable.openIndex, initTable.closeIndex)
      : []
    if (initTable) {
      semanticLocations['init-table'] = offsetRange(
        state,
        state.tokens[initTable.openIndex].start,
        state.tokens[initTable.closeIndex].end,
      )
    }
    initFields.forEach((field) => {
      semanticLocations[`init.${field.name}`] = field.valueRange
      const table = fieldTable(state, field)
      if (table) {
        semanticLocations[`init.${field.name}-table`] = offsetRange(
          state,
          state.tokens[table.openIndex].start,
          state.tokens[table.closeIndex].end,
        )
        if (field.name === 'inputs' || field.name === 'outputs') {
          splitDelimited(state, table.openIndex, table.closeIndex).forEach(([start, end], entryIndex) => {
            semanticLocations[`init.${field.name}[${entryIndex + 1}]`] = offsetRange(
              state,
              state.tokens[start].start,
              state.tokens[end].end,
            )
          })
        }
      }
    })

    const midiField = initFields.find((field) => field.name === 'midi')
    if (midiField) {
      const midiTable = fieldTable(state, midiField)
      if (midiTable) {
        namedTableFields(state, midiTable.openIndex, midiTable.closeIndex).forEach((field) => {
          semanticLocations[`init.midi.${field.name}`] = field.valueRange
        })
      }
    }

    const parameters = indexParameters(
      state,
      initFields.find((field) => field.name === 'parameters'),
      semanticLocations,
    )
    const apiCalls = indexApiCalls(state, semanticLocations)

    return {
      version,
      complete: state.complete,
      callbacks,
      topLevelFields: rootFields.map(publicField),
      initFields: initFields.map(publicField),
      parameters,
      apiCalls,
      symbols,
      semanticLocations,
    }
  } catch {
    return createEmptyIndex(version)
  }
}

export function resolveDiagnosticLocations(
  diagnostics: readonly ScriptDiagnostic[],
  index: LuaSourceIndex | null | undefined,
  modelVersion: number,
) {
  if (!index || index.version !== modelVersion) return [...diagnostics]
  return diagnostics.map((diagnostic) => {
    if (diagnostic.range) return diagnostic
    const hint = diagnostic.semanticLocation
      ?? (diagnostic.callback ? `callback:${diagnostic.callback}` : undefined)
    const range = hint ? index.semanticLocations[hint] : undefined
    return range ? { ...diagnostic, range } : diagnostic
  })
}
