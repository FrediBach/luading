import { describe, expect, it } from 'vitest'
import { createLuaSourceIndex } from '../validation/source-index'
import {
  completionEntriesForSource,
} from './disting-intellisense'
import {
  activeLuaCallAt,
  completionContextAt,
  selfParameterReferenceAt,
} from './disting-intellisense-context'

function cursorSource(value: string) {
  const offset = value.indexOf('|')
  if (offset < 0) throw new Error('Fixture needs a | cursor marker.')
  return { source: value.slice(0, offset) + value.slice(offset + 1), offset }
}

function context(value: string) {
  const { source, offset } = cursorSource(value)
  return completionContextAt(source, offset, createLuaSourceIndex(source, 1))
}

function labels(value: string) {
  const { source, offset } = cursorSource(value)
  return completionEntriesForSource(source, offset).map((entry) => entry.label)
}

describe('Disting completion context', () => {
  it('offers missing top-level fields and every lifecycle family', () => {
    const suggestions = labels(`return {
  name = "Fixture",
  |
}`)

    expect(suggestions).not.toContain('name')
    expect(suggestions).toEqual(expect.arrayContaining([
      'author', 'init', 'step', 'midiMessage', 'serialise', 'pot1Turn', 'button4Release',
    ]))
  })

  it('offers only missing init metadata fields at init table level', () => {
    const suggestions = labels(`return {
  init = function()
    return {
      inputs = { kCV },
      |
    }
  end,
}`)

    expect(suggestions).not.toContain('inputs')
    expect(suggestions).toEqual(expect.arrayContaining([
      'inputNames', 'outputs', 'outputNames', 'parameters', 'midi',
    ]))
    expect(suggestions).not.toContain('drawText')
  })

  it('filters input and output constants by metadata category', () => {
    expect(labels(`return { init = function() return { inputs = { | } } end }`)).toEqual([
      'kCV', 'kGate', 'kTrigger',
    ])
    expect(labels(`return { init = function() return { outputs = { | } } end }`)).toEqual([
      'kStepped', 'kLinear',
    ])
  })

  it('offers numeric, scaled, and enum parameter snippets in parameter lists', () => {
    expect(labels(`return { init = function() return { parameters = {
      |
    } } end }`)).toEqual([
      'numeric parameter', 'scaled parameter', 'enum parameter',
    ])
  })

  it('filters parameter unit and scale positions', () => {
    const units = labels(`return { init = function() return { parameters = {
      { "Gain", 0, 100, 50, | },
    } } end }`)
    const scales = labels(`return { init = function() return { parameters = {
      { "Gain", 0, 1000, 500, kHz, | },
    } } end }`)

    expect(units).toEqual(expect.arrayContaining(['kNone', 'kHz', 'kPercent', 'kMilliseconds']))
    expect(units).not.toContain('kCV')
    expect(scales).toEqual(['kBy10', 'kBy100', 'kBy1000'])
  })

  it('offers documented MIDI, display-mode, and text-alignment string choices', () => {
    expect(labels(`return { init = function() return {
      midi = { channelParameter = 1, messages = { | } },
    } end }`)).toEqual([
      '"note"', '"cc"', '"bend"', '"aftertouch"', '"poly pressure"', '"program change"',
    ])
    expect(labels('setDisplayMode(|)')).toEqual([
      '"overview"', '"meters"', '"parameters"', '"ui"', '"algorithm"', '"menu"',
    ])
    expect(labels('drawText(2, math.max(3, 4), "text, value", 15, |)')).toEqual([
      '"left"', '"centre"', '"right"',
    ])
  })

  it('offers self members and preceding local declarations', () => {
    expect(labels(`local output = {}
local function calculate() return 1 end
return { step = function(self)
  local current = calculate()
  self.|
end }`)).toEqual(['parameters', 'algorithmIndex', 'parameterOffset', 'name', 'author'])

    const suggestions = labels(`local output = {}
local function calculate() return 1 end
return { step = function()
  cal|
end }`)
    expect(suggestions.slice(0, 2)).toEqual(['output', 'calculate'])
  })

  it('keeps callback parameters and block locals within their indexed scope', () => {
    const suggestions = labels(`local shared = 1
return {
  init = function()
    local hidden = 2
    return {}
  end,
  step = function(self, dt, inputs)
    dt|
  end,
}`)

    expect(suggestions).toEqual(expect.arrayContaining(['shared', 'self', 'dt', 'inputs']))
    expect(suggestions).not.toContain('hidden')
  })

  it('suppresses suggestions in comments and ordinary strings', () => {
    expect(labels('-- no kCV here|')).toEqual([])
    expect(labels('local text = "no kCV |here"')).toEqual([])
    expect(context('--[[ long |comment ]]')).toEqual({ kind: 'suppressed' })
  })

  it('only offers the complete scaffold in an empty document', () => {
    expect(labels('  |')).toEqual(['disting script'])
  })
})

describe('balanced Lua call context', () => {
  it('tracks nested calls, tables, multiline arguments, and commas in strings', () => {
    const { source, offset } = cursorSource(`drawText(
  2,
  math.max(3, nested({ 1, 2 }, "a,b")),
  "value, text",
  15,
  |
)`)

    expect(activeLuaCallAt(source, offset)).toEqual({
      name: 'drawText',
      argumentIndex: 4,
      argumentText: '',
    })
  })

  it('identifies the innermost active call', () => {
    const { source, offset } = cursorSource('drawText(2, math.max(1, |), "text")')
    expect(activeLuaCallAt(source, offset)).toMatchObject({ name: 'math.max', argumentIndex: 1 })
  })

  it('finds statically indexed self parameter references', () => {
    const { source, offset } = cursorSource('local value = self.parameters[|2]')
    expect(selfParameterReferenceAt(source, offset)).toMatchObject({ index: 2 })
  })
})
