import {
  DISTING_API_BY_NAME,
  DISTING_API_SUPPORT,
} from './api-manifest'
import type {
  LuaCallbackName,
  ScriptDiagnostic,
  SourceRange,
} from './types'

type Token = {
  value: string
  start: number
  end: number
  line: number
  column: number
}

type CallbackRegion = {
  name: LuaCallbackName
  start: number
  end: number
}

const CALLBACK_NAMES = new Set<LuaCallbackName>(['init', 'step', 'trigger', 'gate', 'draw'])
const HOT_CALLBACKS = new Set<LuaCallbackName>(['step'])

function longBracketEnd(source: string, index: number) {
  const match = source.slice(index).match(/^\[(=*)\[/)
  if (!match) return undefined
  const close = `]${match[1]}]`
  const closeIndex = source.indexOf(close, index + match[0].length)
  return closeIndex < 0 ? source.length : closeIndex + close.length
}

function maskLua(source: string) {
  const result = source.split('')
  let index = 0

  const blank = (start: number, end: number) => {
    for (let cursor = start; cursor < end; cursor += 1) {
      if (result[cursor] !== '\n') result[cursor] = ' '
    }
  }

  while (index < source.length) {
    if (source.startsWith('--', index)) {
      const longStart = longBracketEnd(source, index + 2)
      if (longStart !== undefined) {
        blank(index, longStart)
        index = longStart
        continue
      }
      const end = source.indexOf('\n', index)
      const lineEnd = end < 0 ? source.length : end
      blank(index, lineEnd)
      index = lineEnd
      continue
    }

    const character = source[index]
    if (character === '"' || character === "'") {
      const quote = character
      let end = index + 1
      while (end < source.length) {
        if (source[end] === '\\') {
          end += 2
          continue
        }
        end += 1
        if (source[end - 1] === quote) break
      }
      blank(index, end)
      index = end
      continue
    }

    if (character === '[') {
      const end = longBracketEnd(source, index)
      if (end !== undefined) {
        blank(index, end)
        index = end
        continue
      }
    }

    index += 1
  }

  return result.join('')
}

function tokenize(masked: string): Token[] {
  const tokens: Token[] = []
  const expression = /[A-Za-z_]\w*|\.\.|[()[\]{},.=]|[^\s]/g
  const lineStarts = [0]
  for (let index = 0; index < masked.length; index += 1) {
    if (masked[index] === '\n') lineStarts.push(index + 1)
  }

  for (const match of masked.matchAll(expression)) {
    const start = match.index
    let low = 0
    let high = lineStarts.length
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (lineStarts[middle] <= start) low = middle + 1
      else high = middle
    }
    const lineIndex = Math.max(0, low - 1)
    tokens.push({
      value: match[0],
      start,
      end: start + match[0].length,
      line: lineIndex + 1,
      column: start - lineStarts[lineIndex] + 1,
    })
  }
  return tokens
}

function findCallbackEnd(tokens: Token[], functionIndex: number) {
  const stack: Array<'end' | 'until'> = ['end']
  let pendingLoopDo = 0

  for (let index = functionIndex + 1; index < tokens.length; index += 1) {
    const value = tokens[index].value
    if (value === 'function' || value === 'if') stack.push('end')
    else if (value === 'for' || value === 'while') {
      stack.push('end')
      pendingLoopDo += 1
    } else if (value === 'repeat') stack.push('until')
    else if (value === 'do') {
      if (pendingLoopDo > 0) pendingLoopDo -= 1
      else stack.push('end')
    } else if (value === 'until' && stack.at(-1) === 'until') {
      stack.pop()
    } else if (value === 'end' && stack.at(-1) === 'end') {
      stack.pop()
      if (stack.length === 0) return tokens[index].end
    }
  }
  return tokens.at(-1)?.end ?? 0
}

function findCallbackRegions(tokens: Token[]): CallbackRegion[] {
  const regions: CallbackRegion[] = []
  for (let index = 0; index < tokens.length - 2; index += 1) {
    const name = tokens[index].value as LuaCallbackName
    if (
      !CALLBACK_NAMES.has(name)
      || tokens[index + 1].value !== '='
      || tokens[index + 2].value !== 'function'
    ) continue

    regions.push({
      name,
      start: tokens[index + 2].start,
      end: findCallbackEnd(tokens, index + 2),
    })
  }
  return regions
}

function tokenRange(token: Token): SourceRange {
  return {
    startLine: token.line,
    startColumn: token.column,
    endLine: token.line,
    endColumn: token.column + Math.max(1, token.value.length),
  }
}

function diagnostic(
  ruleId: string,
  token: Token,
  values: Omit<ScriptDiagnostic, 'id' | 'ruleId' | 'range' | 'origin'>,
): ScriptDiagnostic {
  return {
    ...values,
    id: `static:${ruleId}:${token.line}:${token.column}`,
    ruleId,
    range: tokenRange(token),
    origin: 'static',
  }
}

function callbackFor(token: Token, regions: CallbackRegion[]) {
  return regions.find((region) => token.start >= region.start && token.start <= region.end)?.name
}

function isCall(tokens: Token[], index: number) {
  return /^[A-Za-z_]\w*$/.test(tokens[index].value) && tokens[index + 1]?.value === '('
}

function callArgumentCount(source: string, tokens: Token[], index: number) {
  const opening = tokens[index + 1]
  const stack = ['(']
  let commas = 0

  for (let cursor = index + 2; cursor < tokens.length; cursor += 1) {
    const value = tokens[cursor].value
    if (value === '(' || value === '[' || value === '{') stack.push(value)
    else if (value === ')' || value === ']' || value === '}') {
      stack.pop()
      if (stack.length === 0) {
        const hasContent = source.slice(opening.end, tokens[cursor].start).trim().length > 0
        return hasContent ? commas + 1 : 0
      }
    } else if (value === ',' && stack.length === 1) {
      commas += 1
    }
  }
  return undefined
}

function hasSequence(tokens: Token[], index: number, sequence: string[]) {
  return sequence.every((value, offset) => tokens[index + offset]?.value === value)
}

function staticApiDiagnostics(source: string, tokens: Token[], regions: CallbackRegion[]) {
  const diagnostics: ScriptDiagnostic[] = []
  const reportedSupportCaveats = new Set<string>()

  for (let index = 0; index < tokens.length; index += 1) {
    if (!isCall(tokens, index)) continue
    const token = tokens[index]
    const entry = DISTING_API_BY_NAME.get(token.value)
    if (!entry) continue
    const callback = callbackFor(token, regions)
    const argumentCount = callArgumentCount(source, tokens, index)
    const requiredArguments = entry.parameters.filter((parameter) => (
      !parameter.endsWith('?') && !parameter.startsWith('...')
    )).length
    const variadic = entry.parameters.some((parameter) => parameter.startsWith('...'))

    if (
      argumentCount !== undefined
      && (argumentCount < requiredArguments || (!variadic && argumentCount > entry.parameters.length))
    ) {
      const expected = variadic
        ? `at least ${requiredArguments}`
        : requiredArguments === entry.parameters.length
          ? String(requiredArguments)
          : `${requiredArguments}–${entry.parameters.length}`
      diagnostics.push(diagnostic('api-argument-count', token, {
        severity: 'warning',
        category: 'api',
        target: 'hardware',
        callback,
        message: `${entry.name}() received ${argumentCount} arguments`,
        detail: `${entry.signature} expects ${expected} arguments.`,
        suggestion: `Use the documented ${entry.signature} signature.`,
        penalty: 0,
      }))
    }

    if (entry.support !== 'full' && !reportedSupportCaveats.has(entry.name)) {
      reportedSupportCaveats.add(entry.name)
      diagnostics.push(diagnostic(`simulator-api-${entry.support}`, token, {
        severity: 'info',
        category: 'compatibility',
        target: 'simulator',
        callback,
        message: `${entry.name}() ${DISTING_API_SUPPORT[entry.support].diagnostic}`,
        detail: entry.supportDetail ?? `The ${entry.signature} API is not fully emulated.`,
        suggestion: 'Test this behavior on hardware and use the simulator for the supported portions of the script.',
        penalty: 0,
      }))
    }

    if (entry.contexts && callback && !entry.contexts.includes(callback)) {
      diagnostics.push(diagnostic('drawing-outside-draw', token, {
        severity: 'warning',
        category: 'contract',
        target: 'hardware',
        callback,
        message: `${entry.name}() is called from ${callback}()`,
        detail: 'The Disting NT manual requires all drawing operations to run from draw(). Calls made from other lifecycle callbacks have undefined results.',
        suggestion: 'Store the display state here and perform the drawing from draw().',
        penalty: 0,
      }))
    }

    if (callback && HOT_CALLBACKS.has(callback) && (entry.name === 'findAlgorithm' || entry.name === 'findParameter')) {
      diagnostics.push(diagnostic('hot-preset-lookup', token, {
        severity: 'warning',
        category: 'realtime',
        target: 'hardware',
        callback,
        message: `${entry.name}() runs in the 1 kHz step callback`,
        detail: 'Preset and parameter searches do string matching. The manual recommends resolving and caching these indices during initialization.',
        suggestion: `Call ${entry.name}() once before the hot path and reuse the returned index.`,
        penalty: 6,
      }))
    }
  }
  return diagnostics
}

export function validateLuaSource(source: string): ScriptDiagnostic[] {
  const masked = maskLua(source)
  const tokens = tokenize(masked)
  const regions = findCallbackRegions(tokens)
  const diagnostics = staticApiDiagnostics(source, tokens, regions)

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const callback = callbackFor(token, regions)
    if (!callback) continue

    if (callback === 'step' && token.value === '{') {
      diagnostics.push(diagnostic('hot-table-allocation', token, {
        severity: 'warning',
        category: 'realtime',
        target: 'hardware',
        callback,
        message: 'A new table is created inside step()',
        detail: 'step() runs every millisecond. Repeated table allocation creates avoidable garbage-collection work on the module.',
        suggestion: 'Allocate reusable output and work tables at script scope, then update their entries in step().',
        penalty: 3,
      }))
    }

    if (callback === 'step' && token.value === '..') {
      diagnostics.push(diagnostic('hot-string-concatenation', token, {
        severity: 'warning',
        category: 'realtime',
        target: 'hardware',
        callback,
        message: 'String concatenation runs inside step()',
        detail: 'Creating strings in the 1 kHz callback adds allocation and garbage-collection pressure.',
        suggestion: 'Move display formatting to draw() or update a cached string only when its value changes.',
        penalty: 4,
      }))
    }

    if (callback === 'step' && (
      hasSequence(tokens, index, ['string', '.', 'format', '('])
      || hasSequence(tokens, index, ['require', '('])
    )) {
      diagnostics.push(diagnostic('hot-expensive-call', token, {
        severity: 'warning',
        category: 'realtime',
        target: 'hardware',
        callback,
        message: `${hasSequence(tokens, index, ['require', '(']) ? 'require' : 'string.format'}() runs inside step()`,
        detail: 'This operation performs avoidable work in the callback that runs every millisecond.',
        suggestion: 'Move it out of step(), or recompute only when the underlying value changes.',
        penalty: 6,
      }))
    }

    if (
      token.value === 'self'
      && hasSequence(tokens, index, ['self', '.', 'parameters', '['])
    ) {
      let cursor = index + 4
      let bracketDepth = 1
      while (cursor < tokens.length && bracketDepth > 0) {
        if (tokens[cursor].value === '[') bracketDepth += 1
        else if (tokens[cursor].value === ']') bracketDepth -= 1
        cursor += 1
      }
      if (tokens[cursor]?.value === '=') {
        diagnostics.push(diagnostic('readonly-parameters', token, {
          severity: 'warning',
          category: 'api',
          target: 'hardware',
          callback,
          message: 'self.parameters is read-only',
          detail: 'The Disting NT contract exposes self.parameters for reading. Direct writes bypass the parameter system and are not portable.',
          suggestion: 'Use setParameter(self.algorithmIndex, self.parameterOffset + index, value).',
          penalty: 10,
        }))
      }
    }
  }

  const firstCommentLines = source
    .split('\n')
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => line.length > 0)
    .slice(0, 2)
  if (!firstCommentLines[0]?.line.startsWith('--')) {
    diagnostics.push({
      id: 'static:missing-header-comment:1:1',
      ruleId: 'missing-header-comment',
      severity: 'info',
      category: 'clarity',
      target: 'hardware',
      origin: 'static',
      message: 'Add a script name and description comment',
      detail: 'The module uses the first two comments to describe the script before it is loaded.',
      suggestion: 'Start the file with a short -- Name line followed by a -- Description line.',
      penalty: 0,
      range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
    })
  }

  return diagnostics
}
