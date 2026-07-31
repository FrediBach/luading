import {
  DISTING_API_BY_NAME,
  DISTING_CONSTANTS,
  DISTING_LIFECYCLE_BY_NAME,
  type DistingConstantCategory,
} from './api-manifest'
import type { LuaSourceIndex } from './source-index'
import type {
  DiagnosticQuickFix,
  ScriptDiagnostic,
  SourceEdit,
  SourceRange,
} from './types'

const REQUIRED_DRAWING_COLOUR = new Set([
  'drawBox',
  'drawCircle',
  'drawLine',
  'drawRectangle',
  'drawSmoothCircle',
  'drawSmoothLine',
])

function sourceLineStarts(source: string) {
  const starts = [0]
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') starts.push(index + 1)
  }
  return starts
}

function offsetAt(source: string, line: number, column: number) {
  const starts = sourceLineStarts(source)
  const lineStart = starts[Math.max(0, Math.min(starts.length - 1, line - 1))]
  return Math.min(source.length, lineStart + Math.max(0, column - 1))
}

function positionAt(source: string, offset: number) {
  const starts = sourceLineStarts(source)
  const bounded = Math.max(0, Math.min(source.length, offset))
  let lineIndex = 0
  for (let index = 1; index < starts.length; index += 1) {
    if (starts[index] > bounded) break
    lineIndex = index
  }
  return { line: lineIndex + 1, column: bounded - starts[lineIndex] + 1 }
}

function rangeAtOffsets(source: string, start: number, end = start): SourceRange {
  const from = positionAt(source, start)
  const to = positionAt(source, end)
  return {
    startLine: from.line,
    startColumn: from.column,
    endLine: to.line,
    endColumn: to.column,
  }
}

function rangeOffsets(source: string, range: SourceRange) {
  return {
    start: offsetAt(source, range.startLine, range.startColumn),
    end: offsetAt(source, range.endLine, range.endColumn),
  }
}

function insert(source: string, offset: number, text: string): SourceEdit {
  return { range: rangeAtOffsets(source, offset), text }
}

function replace(range: SourceRange, text: string): SourceEdit {
  return { range, text }
}

function previousNonWhitespace(source: string, before: number) {
  let offset = before - 1
  while (offset >= 0 && /\s/.test(source[offset])) offset -= 1
  return offset
}

function indentBlock(value: string, indent: string) {
  return value.split('\n').map((line) => `${indent}${line}`).join('\n')
}

function expandSnippetDefaults(snippet: string) {
  return snippet.replace(/\$\{\d+:([^}]*)\}/g, '$1')
}

function tableInsertionEdits(
  source: string,
  tableRange: SourceRange | undefined,
  entry: string,
) {
  if (!tableRange) return []
  const closeOffset = Math.max(0, rangeOffsets(source, tableRange).end - 1)
  if (source[closeOffset] !== '}') return []
  const lineStart = source.lastIndexOf('\n', closeOffset - 1) + 1
  const beforeClose = source.slice(lineStart, closeOffset)
  const lineIndent = beforeClose.match(/^\s*/)?.[0] ?? ''
  const closeOnOwnLine = beforeClose.trim().length === 0
  const insertionOffset = closeOnOwnLine ? lineStart : closeOffset
  const entryIndent = `${lineIndent}  `
  const text = closeOnOwnLine
    ? `${indentBlock(entry, entryIndent)}\n`
    : `\n${indentBlock(entry, entryIndent)}\n${lineIndent}`
  const edits: SourceEdit[] = [insert(source, insertionOffset, text)]
  const previous = previousNonWhitespace(source, insertionOffset)
  if (previous >= 0 && source[previous] !== '{' && source[previous] !== ',') {
    edits.push(insert(source, previous + 1, ','))
  }
  return edits
}

function topLevelInsertion(
  source: string,
  index: LuaSourceIndex,
  id: string,
  title: string,
  entry: string,
): DiagnosticQuickFix[] {
  const edits = tableInsertionEdits(source, index.semanticLocations['top-level-table'], entry)
  return edits.length > 0 ? [{ id, title, edits, preferred: true }] : []
}

function lifecycleInsertion(
  source: string,
  index: LuaSourceIndex,
  callback: 'trigger' | 'gate' | 'midiMessage',
) {
  const lifecycle = DISTING_LIFECYCLE_BY_NAME.get(callback)
  if (!lifecycle) return []
  return topLevelInsertion(
    source,
    index,
    `insert-${callback}-callback`,
    `Insert ${callback}() callback`,
    expandSnippetDefaults(lifecycle.snippet),
  )
}

function headerFix(source: string, diagnostic: ScriptDiagnostic): DiagnosticQuickFix[] {
  if (diagnostic.ruleId === 'missing-header-comment') {
    return [{
      id: 'insert-script-header-comments',
      title: 'Insert script name and description comments',
      preferred: true,
      edits: [insert(source, 0, '-- Script name\n-- Describe what the script does.\n')],
    }]
  }
  if (diagnostic.ruleId !== 'missing-description-comment') return []

  const firstNonEmpty = source.split('\n').findIndex((line) => line.trim().length > 0)
  if (firstNonEmpty < 0) return []
  const starts = sourceLineStarts(source)
  const lineStart = starts[firstNonEmpty]
  const newline = source.indexOf('\n', lineStart)
  const insertionOffset = newline < 0 ? source.length : newline + 1
  const text = newline < 0
    ? '\n-- Describe what the script does.\n'
    : '-- Describe what the script does.\n'
  return [{
    id: 'insert-description-comment',
    title: 'Insert script description comment',
    preferred: true,
    edits: [insert(source, insertionOffset, text)],
  }]
}

function constantCategoryForRule(ruleId: string): {
  category: DistingConstantCategory
  semanticLocation: string
} | undefined {
  const io = ruleId.match(/^(inputs|outputs)-type-(\d+)$/)
  if (io) return {
    category: io[1] === 'inputs' ? 'input-type' : 'output-mode',
    semanticLocation: `init.${io[1]}[${io[2]}]`,
  }
  const parameter = ruleId.match(/^parameter-(\d+)-(unit|scale)$/)
  if (!parameter) return undefined
  return {
    category: parameter[2] === 'unit' ? 'parameter-unit' : 'parameter-scale',
    semanticLocation: `parameters[${parameter[1]}].${parameter[2]}`,
  }
}

function constantFixes(
  diagnostic: ScriptDiagnostic,
  index: LuaSourceIndex,
): DiagnosticQuickFix[] {
  const target = constantCategoryForRule(diagnostic.ruleId)
  if (!target) return []
  const range = index.semanticLocations[target.semanticLocation]
  if (!range) return []
  return DISTING_CONSTANTS
    .filter((entry) => entry.category === target.category)
    .map((entry, choiceIndex) => ({
      id: `replace-${diagnostic.ruleId}-with-${entry.name}`,
      title: `Replace with ${entry.name}`,
      edits: [replace(range, entry.name)],
      preferred: choiceIndex === 0,
    }))
}

function drawingColourFix(
  source: string,
  diagnostic: ScriptDiagnostic,
  index: LuaSourceIndex,
): DiagnosticQuickFix[] {
  if (diagnostic.ruleId !== 'api-argument-count' || !diagnostic.range) return []
  const call = index.apiCalls.find((entry) => (
    entry.nameRange.startLine === diagnostic.range?.startLine
    && entry.nameRange.startColumn === diagnostic.range.startColumn
    && REQUIRED_DRAWING_COLOUR.has(entry.name)
  ))
  if (!call) return []
  const api = DISTING_API_BY_NAME.get(call.name)
  if (!api || call.argumentRanges.length !== api.overloads[0].parameters.length - 1) return []
  const closingParenthesis = rangeOffsets(source, call.range).end - 1
  if (source[closingParenthesis] !== ')') return []
  return [{
    id: `add-${call.name}-colour`,
    title: 'Add full-bright drawing colour (15)',
    preferred: true,
    edits: [insert(source, closingParenthesis, ', 15')],
  }]
}

function readonlyParameterFix(
  source: string,
  diagnostic: ScriptDiagnostic,
): DiagnosticQuickFix[] {
  if (diagnostic.ruleId !== 'readonly-parameters' || !diagnostic.range) return []
  const line = source.split('\n')[diagnostic.range.startLine - 1] ?? ''
  const commentStart = line.indexOf('--')
  const code = (commentStart < 0 ? line : line.slice(0, commentStart)).trimEnd()
  const assignment = code.match(/^(\s*)self\s*\.\s*parameters\s*\[\s*(\d+)\s*\]\s*=\s*(.+)$/)
  if (!assignment) return []
  const [, indent, parameterIndex, rawValue] = assignment
  const value = rawValue.trim()
  if (
    value.length === 0
    || /[,;{}]/.test(value)
    || /\b(?:function|do|then|end)\b/.test(value)
  ) return []
  const startColumn = indent.length + 1
  const range = {
    startLine: diagnostic.range.startLine,
    startColumn,
    endLine: diagnostic.range.startLine,
    endColumn: code.length + 1,
  }
  return [{
    id: `use-set-parameter-${parameterIndex}`,
    title: 'Use setParameter() for this assignment',
    preferred: true,
    edits: [replace(
      range,
      `${indent}setParameter(self.algorithmIndex, self.parameterOffset + ${parameterIndex}, ${value})`.trimStart(),
    )],
  }]
}

function ensureMidiParameterEdits(
  source: string,
  index: LuaSourceIndex,
) {
  const parametersTable = index.semanticLocations['init.parameters-table']
  if (parametersTable) {
    return {
      parameterIndex: index.parameters.length + 1,
      edits: tableInsertionEdits(
        source,
        parametersTable,
        '{ "MIDI channel", 0, 16, 0 },',
      ),
    }
  }
  return {
    parameterIndex: 1,
    edits: tableInsertionEdits(
      source,
      index.semanticLocations['init-table'],
      'parameters = { { "MIDI channel", 0, 16, 0 } },',
    ),
  }
}

function midiMetadataFix(
  source: string,
  diagnostic: ScriptDiagnostic,
  index: LuaSourceIndex,
): DiagnosticQuickFix[] {
  const midiRule = diagnostic.ruleId === 'missing-midi-metadata'
    || diagnostic.ruleId === 'midi-shape'
    || diagnostic.ruleId === 'midi-channel-parameter'
    || diagnostic.ruleId === 'midi-messages'
  if (!midiRule) return []

  if (diagnostic.ruleId === 'midi-messages') {
    const messages = index.semanticLocations['init.midi.messages']
    return messages ? [{
      id: 'replace-midi-message-filters',
      title: 'Replace with documented MIDI message filters',
      preferred: true,
      edits: [replace(messages, '{ "note", "cc" }')],
    }] : []
  }

  if (diagnostic.ruleId === 'midi-channel-parameter' && index.parameters.length > 0) {
    const channel = index.semanticLocations['init.midi.channelParameter']
    return channel ? [{
      id: 'replace-midi-channel-parameter',
      title: 'Reference the first declared parameter',
      preferred: true,
      edits: [replace(channel, '1')],
    }] : []
  }

  const initTable = index.semanticLocations['init-table']
  if (!initTable) {
    if (diagnostic.ruleId !== 'missing-midi-metadata') return []
    return topLevelInsertion(source, index, 'insert-midi-init-metadata', 'Insert MIDI metadata scaffold', [
      'init = function(self)',
      '  return {',
      '    parameters = { { "MIDI channel", 0, 16, 0 } },',
      '    midi = { channelParameter = 1, messages = { "note", "cc" } },',
      '  }',
      'end,',
    ].join('\n'))
  }

  const parameter = ensureMidiParameterEdits(source, index)
  const midiValue = `{ channelParameter = ${parameter.parameterIndex}, messages = { "note", "cc" } }`
  const existingMidi = index.initFields.find((field) => field.name === 'midi')
  if (!existingMidi && !index.semanticLocations['init.parameters-table']) {
    const edits = tableInsertionEdits(source, initTable, [
      'parameters = { { "MIDI channel", 0, 16, 0 } },',
      'midi = { channelParameter = 1, messages = { "note", "cc" } },',
    ].join('\n'))
    return edits.length > 0 ? [{
      id: 'insert-valid-midi-metadata',
      title: 'Insert valid MIDI metadata',
      preferred: true,
      edits,
    }] : []
  }
  const midiEdits = existingMidi
    ? [replace(existingMidi.valueRange, midiValue)]
    : tableInsertionEdits(source, initTable, `midi = ${midiValue},`)
  const edits = [...parameter.edits, ...midiEdits]
  return edits.length > 0 ? [{
    id: 'insert-valid-midi-metadata',
    title: existingMidi ? 'Replace with valid MIDI metadata' : 'Insert valid MIDI metadata',
    preferred: true,
    edits,
  }] : []
}

export function quickFixesForDiagnostic(
  source: string,
  diagnostic: ScriptDiagnostic,
  index: LuaSourceIndex,
): DiagnosticQuickFix[] {
  const fixes = [
    ...headerFix(source, diagnostic),
    ...constantFixes(diagnostic, index),
    ...drawingColourFix(source, diagnostic, index),
    ...readonlyParameterFix(source, diagnostic),
    ...midiMetadataFix(source, diagnostic, index),
  ]
  if (diagnostic.ruleId === 'missing-trigger-callback') {
    fixes.push(...lifecycleInsertion(source, index, 'trigger'))
  } else if (diagnostic.ruleId === 'missing-gate-callback') {
    fixes.push(...lifecycleInsertion(source, index, 'gate'))
  } else if (diagnostic.ruleId === 'missing-midi-callback') {
    fixes.push(...lifecycleInsertion(source, index, 'midiMessage'))
  } else if (diagnostic.ruleId === 'missing-program-name') {
    fixes.push(...topLevelInsertion(
      source,
      index,
      'insert-program-name',
      'Add script name field',
      'name = "Script name",',
    ))
  } else if (diagnostic.ruleId === 'missing-program-author') {
    fixes.push(...topLevelInsertion(
      source,
      index,
      'insert-program-author',
      'Add script author field',
      'author = "Author",',
    ))
  }
  return fixes
}

export function applySourceEdits(source: string, edits: readonly SourceEdit[]) {
  return edits
    .map((edit) => ({ ...edit, offsets: rangeOffsets(source, edit.range) }))
    .sort((left, right) => right.offsets.start - left.offsets.start)
    .reduce((value, edit) => (
      value.slice(0, edit.offsets.start) + edit.text + value.slice(edit.offsets.end)
    ), source)
}
