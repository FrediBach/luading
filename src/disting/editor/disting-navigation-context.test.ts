import { describe, expect, it } from 'vitest'
import { createLuaSourceIndex } from '../validation/source-index'
import type { SourceRange } from '../validation/types'
import {
  documentSymbolsForSource,
  foldingRangesForSource,
  isValidLuaIdentifier,
  resolvedLocalSymbolAt,
} from './disting-navigation-context'

function offsetAt(source: string, marker: string, occurrence = 1) {
  let offset = -1
  for (let count = 0; count < occurrence; count += 1) {
    offset = source.indexOf(marker, offset + 1)
  }
  return offset
}

function textAt(source: string, range: SourceRange) {
  const lines = source.split('\n')
  const before = (line: number) => lines.slice(0, line - 1)
    .reduce((total, entry) => total + entry.length + 1, 0)
  const start = before(range.startLine) + range.startColumn - 1
  const end = before(range.endLine) + range.endColumn - 1
  return source.slice(start, end)
}

const source = `local output = {}
local function scale(value)
  local result = value * 2
  return result
end

return {
  name = "Navigation fixture",
  author = "Test",
  init = function()
    return {
      inputs = {
        kCV,
        kGate,
      },
      outputs = { kLinear },
      parameters = {
        { "Gain", 0, 100, 50, kPercent },
      },
    }
  end,
  step = function(self, dt, inputs)
    output[1] = scale(inputs[1])
    return output
  end,
}`

describe('Disting navigation context', () => {
  it('builds ordered document symbols for callbacks, local functions, and metadata', () => {
    const symbols = documentSymbolsForSource(source, createLuaSourceIndex(source, 1))

    expect(symbols.map((symbol) => [symbol.name, symbol.kind])).toEqual(expect.arrayContaining([
      ['scale', 'function'],
      ['name', 'metadata'],
      ['author', 'metadata'],
      ['init', 'callback'],
      ['inputs', 'metadata'],
      ['outputs', 'metadata'],
      ['parameters', 'metadata'],
      ['step', 'callback'],
    ]))
    expect(symbols.find((symbol) => symbol.name === 'parameters')?.children?.[0]).toMatchObject({
      name: 'Parameter 1: Gain',
      kind: 'parameter',
    })
  })

  it('creates non-duplicated folds for callback bodies, local functions, and large metadata', () => {
    const folds = foldingRangesForSource(createLuaSourceIndex(source, 1))

    expect(folds).toContainEqual({ startLine: 2, endLine: 4 })
    expect(folds).toContainEqual({ startLine: 10, endLine: 20 })
    expect(folds).toContainEqual({ startLine: 12, endLine: 14 })
    expect(new Set(folds.map((fold) => `${fold.startLine}:${fold.endLine}`)).size).toBe(folds.length)
  })

  it('resolves local definitions and all references in their lexical scope', () => {
    const index = createLuaSourceIndex(source, 1)
    const helper = resolvedLocalSymbolAt(source, offsetAt(source, 'scale(inputs') + 2, index)
    const parameter = resolvedLocalSymbolAt(source, offsetAt(source, 'value *') + 2, index)

    expect(helper?.definition.name).toBe('scale')
    expect(textAt(source, helper!.definition.selectionRange)).toBe('scale')
    expect(helper?.references.map((range) => textAt(source, range))).toEqual(['scale', 'scale'])
    expect(parameter?.definition).toMatchObject({ name: 'value', kind: 'parameter' })
    expect(parameter?.references.map((range) => textAt(source, range))).toEqual(['value', 'value'])
  })

  it('keeps shadowed locals separate and ignores fields, table keys, strings, and comments', () => {
    const shadowed = `local level = 1
local function calculate(level)
  local record = { level = level }
  record.level = level
  -- level is commentary
  return "level", level
end
return { step = function() return { level, calculate(2) } end }
`
    const index = createLuaSourceIndex(shadowed, 1)
    const parameter = resolvedLocalSymbolAt(
      shadowed,
      offsetAt(shadowed, 'level }', 1),
      index,
    )
    const outer = resolvedLocalSymbolAt(
      shadowed,
      offsetAt(shadowed, 'level, calculate'),
      index,
    )

    expect(parameter?.definition.kind).toBe('parameter')
    expect(parameter?.references).toHaveLength(4)
    expect(outer?.definition.kind).toBe('local')
    expect(outer?.references).toHaveLength(2)
    expect(resolvedLocalSymbolAt(shadowed, offsetAt(shadowed, 'record.level') + 8, index)).toBeUndefined()
    expect(resolvedLocalSymbolAt('return print("x")', 8, createLuaSourceIndex('return print("x")', 1))).toBeUndefined()
    expect(resolvedLocalSymbolAt('local unfinished = {', 7, createLuaSourceIndex('local unfinished = {', 1))).toBeUndefined()
  })

  it('accepts Lua identifiers while rejecting keywords and malformed names', () => {
    expect(isValidLuaIdentifier('next_value2')).toBe(true)
    expect(isValidLuaIdentifier('end')).toBe(false)
    expect(isValidLuaIdentifier('2value')).toBe(false)
  })
})
