import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ScriptDiagnostic, SourceRange } from './types'
import {
  createLuaSourceIndex,
  resolveDiagnosticLocations,
} from './source-index'

function textAt(source: string, range: SourceRange) {
  const lines = source.split('\n')
  if (range.startLine === range.endLine) {
    return lines[range.startLine - 1]?.slice(range.startColumn - 1, range.endColumn - 1)
  }
  return ''
}

describe('createLuaSourceIndex', () => {
  const source = `-- Indexed script
local out = {}
local function edge(self, input, rising)
  return out
end

return {
  name = "Index fixture",
  author = "Test",
  luading = {
    parameterPresets = {
      { name = "Low", values = { 25, 1 } },
      { name = "High", values = { 100, 2 } },
    },
  },
  init = function()
    return {
      inputs = { kCV, kGate },
      outputs = { kLinear },
      parameters = {
        { "Level", 0, 100, 50, kPercent },
        { "Mode", { "A", "B" }, 1 },
      },
      midi = {
        channelParameter = 1,
        messages = { "note", "cc" },
      },
    }
  end,
  step = function(self, dt, inputs)
    out[1] = math.max(0, inputs[1])
    drawText(4, 8, string.format("%d", out[1]), 15)
    return out
  end,
  gate = edge,
}`

  it('indexes callbacks, metadata, parameters, calls, and local symbols', () => {
    const index = createLuaSourceIndex(source, 17)

    expect(index.version).toBe(17)
    expect(index.complete).toBe(true)
    expect(index.topLevelFields.map((field) => field.name)).toEqual([
      'name', 'author', 'luading', 'init', 'step', 'gate',
    ])
    expect(index.callbacks.map((callback) => callback.name)).toEqual(['init', 'step', 'gate'])
    expect(textAt(source, index.semanticLocations['callback:step'])).toBe('step')
    expect(textAt(source, index.semanticLocations['init.outputs'])).toBe('{ kLinear }')
    expect(textAt(source, index.semanticLocations['init.inputs[2]'])).toBe('kGate')
    expect(textAt(source, index.semanticLocations['init.outputs[1]'])).toBe('kLinear')
    expect(textAt(source, index.semanticLocations['parameters[1].default'])).toBe('50')
    expect(textAt(source, index.semanticLocations['parameters[2].enum'])).toBe('{ "A", "B" }')
    expect(textAt(source, index.semanticLocations['init.midi.messages'])).toBe('{ "note", "cc" }')
    expect(index.semanticLocations['topLevel:luading.parameterPresets']).toBeDefined()
    expect(textAt(source, index.semanticLocations['topLevel:luading.parameterPresets[1].name']))
      .toBe('"Low"')
    expect(textAt(source, index.semanticLocations['topLevel:luading.parameterPresets[2].values[2]']))
      .toBe('2')
    expect(index.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'out', kind: 'local', isLocal: true }),
      expect.objectContaining({ name: 'edge', kind: 'function', isLocal: true }),
    ]))

    const drawText = index.apiCalls.find((call) => call.name === 'drawText')
    expect(drawText).toBeDefined()
    expect(drawText?.argumentRanges.map((range) => textAt(source, range))).toEqual([
      '4', '8', 'string.format("%d", out[1])', '15',
    ])
  })

  it('resolves semantic hints and callback fallbacks only for the current model version', () => {
    const index = createLuaSourceIndex(source, 3)
    const diagnostics: ScriptDiagnostic[] = [{
      id: 'contract:outputs-type-1',
      ruleId: 'outputs-type-1',
      severity: 'error',
      category: 'contract',
      target: 'hardware',
      origin: 'contract',
      message: 'Bad output',
      detail: 'Invalid output metadata.',
      penalty: 0,
      semanticLocation: 'init.outputs',
    }, {
      id: 'runtime:callback-output:step',
      ruleId: 'callback-output',
      severity: 'error',
      category: 'contract',
      target: 'hardware',
      origin: 'runtime',
      callback: 'step',
      message: 'Bad output',
      detail: 'Invalid callback output.',
      penalty: 0,
    }]

    const current = resolveDiagnosticLocations(diagnostics, index, 3)
    expect(textAt(source, current[0].range!)).toBe('{ kLinear }')
    expect(textAt(source, current[1].range!)).toBe('step')
    expect(resolveDiagnosticLocations(diagnostics, index, 4)).toEqual(diagnostics)
  })

  it('degrades to a partial index for malformed source', () => {
    const index = createLuaSourceIndex('return { step = function() drawText(1, 2, "x")', 1)

    expect(index.complete).toBe(false)
    expect(index.version).toBe(1)
    expect(index.apiCalls.map((call) => call.name)).toContain('drawText')
  })

  it('handles representative Lua 5.4 structural syntax', () => {
    const index = createLuaSourceIndex(`
local mask <const> = (0xff << 2) // 3
local text = [==[long string]==]
local function choose(value)
  if value ~= 0 then
    return mask | value
  end
  return 0
end
return { name = text, step = function() return { choose(1) } end }
`, 2)

    expect(index.complete).toBe(true)
    expect(index.callbacks.map((callback) => callback.name)).toContain('step')
    expect(index.symbols.map((symbol) => symbol.name)).toEqual(expect.arrayContaining(['mask', 'text', 'choose']))
  })

  it('distinguishes local functions from global declarations for safe navigation', () => {
    const indexed = createLuaSourceIndex(`
function exposed() end
local function hidden() end
local assigned = function() end
return { step = hidden }
`, 4)

    expect(indexed.symbols.find((symbol) => symbol.name === 'exposed')?.isLocal).toBe(false)
    expect(indexed.symbols.find((symbol) => symbol.name === 'hidden')?.isLocal).toBe(true)
    expect(indexed.symbols.find((symbol) => symbol.name === 'assigned')?.isLocal).toBe(true)
  })

  it('follows local tables returned by init metadata', () => {
    const referenced = `
local definitions = { { "Gain", 0, 10, 5 } }
local metadata = {
  outputs = { kLinear },
  parameters = definitions,
}
local function init()
  return metadata
end
return { init = init }
`
    const index = createLuaSourceIndex(referenced, 8)

    expect(index.complete).toBe(true)
    expect(index.initFields.map((field) => field.name)).toEqual(['outputs', 'parameters'])
    expect(textAt(referenced, index.semanticLocations['parameters[1].default'])).toBe('5')
  })
})

describe('bundled source index corpus', () => {
  const roots = [
    join(process.cwd(), 'lua-scripts/expert-sleepers'),
    join(process.cwd(), 'lua-scripts/fredi-bach'),
  ]
  const files = roots.flatMap((root) => readdirSync(root)
    .filter((filename) => filename.endsWith('.lua'))
    .map((filename) => join(root, filename)))

  it('structurally indexes every bundled script', () => {
    const failures = files.flatMap((path, version) => {
      const index = createLuaSourceIndex(readFileSync(path, 'utf8'), version)
      return index.complete && index.topLevelFields.length > 0
        ? []
        : [`${path}: complete=${index.complete}, fields=${index.topLevelFields.length}`]
    })

    expect(files).toHaveLength(67)
    expect(failures).toEqual([])
  })
})
