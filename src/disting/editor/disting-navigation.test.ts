import { describe, expect, it, vi } from 'vitest'
import { DISTING_LUA_LANGUAGE_ID } from './disting-lua'
import { registerDistingNavigation } from './disting-navigation'

const source = `local output = {}
local function build(value)
  return value * 2
end
return {
  init = function()
    return {
      inputs = {
        kCV,
        kGate,
      },
    }
  end,
  step = function(self, dt, inputs)
    output[1] = build(inputs[1])
    return output
  end,
}`

function cursorPosition(value: string, offset: number) {
  const before = value.slice(0, offset).split('\n')
  return { lineNumber: before.length, column: before.at(-1)!.length + 1 }
}

function modelFor(value: string) {
  return {
    uri: { path: '/main.lua' },
    getValue: () => value,
    getVersionId: () => 7,
    getOffsetAt(position: { lineNumber: number; column: number }) {
      const lines = value.split('\n')
      return lines.slice(0, position.lineNumber - 1)
        .reduce((total, line) => total + line.length + 1, 0) + position.column - 1
    },
  }
}

function navigationHarness() {
  const providers: Record<string, Record<string, (...args: never[]) => unknown>> = {}
  const disposables = Array.from({ length: 4 }, () => ({ dispose: vi.fn() }))
  let disposableIndex = 0
  class Range {
    readonly startLineNumber: number
    readonly startColumn: number
    readonly endLineNumber: number
    readonly endColumn: number

    constructor(
      startLineNumber: number,
      startColumn: number,
      endLineNumber: number,
      endColumn: number,
    ) {
      this.startLineNumber = startLineNumber
      this.startColumn = startColumn
      this.endLineNumber = endLineNumber
      this.endColumn = endColumn
    }
  }
  const registration = (name: string) => (languageId: string, provider: Record<string, (...args: never[]) => unknown>) => {
    expect(languageId).toBe(DISTING_LUA_LANGUAGE_ID)
    providers[name] = provider
    return disposables[disposableIndex++]
  }
  const monaco = {
    Range,
    languages: {
      SymbolKind: { Method: 1, Function: 2, Variable: 3, Field: 4 },
      FoldingRangeKind: { Region: { value: 'region' } },
      registerDocumentSymbolProvider: vi.fn(registration('symbols')),
      registerDefinitionProvider: vi.fn(registration('definition')),
      registerRenameProvider: vi.fn(registration('rename')),
      registerFoldingRangeProvider: vi.fn(registration('folding')),
    },
  }
  const navigation = registerDistingNavigation(monaco as never)
  return { navigation, providers, disposables, monaco }
}

describe('Disting navigation providers', () => {
  it('registers all providers idempotently for Disting Lua and disposes them once', () => {
    const harness = navigationHarness()

    expect(registerDistingNavigation(harness.monaco as never)).toBe(harness.navigation)
    harness.navigation.dispose()
    harness.navigation.dispose()
    expect(harness.disposables.every((entry) => entry.dispose.mock.calls.length === 1)).toBe(true)
  })

  it('adapts document symbols and folding ranges to Monaco', () => {
    const { providers, navigation } = navigationHarness()
    const model = modelFor(source)
    const symbols = providers.symbols.provideDocumentSymbols(model as never) as Array<{
      name: string
      kind: number
      children?: Array<{ name: string }>
    }>
    const folds = providers.folding.provideFoldingRanges(model as never) as Array<{
      start: number
      end: number
      kind: { value: string }
    }>

    expect(symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'build', kind: 2 }),
      expect.objectContaining({ name: 'init', kind: 1 }),
      expect.objectContaining({ name: 'inputs', kind: 4 }),
      expect.objectContaining({ name: 'step', kind: 1 }),
    ]))
    expect(folds).toContainEqual({ start: 6, end: 12, kind: { value: 'region' } })
    navigation.dispose()
  })

  it('provides local definitions and safe whole-symbol rename edits', () => {
    const { providers, navigation } = navigationHarness()
    const model = modelFor(source)
    const useOffset = source.indexOf('build(inputs') + 2
    const position = cursorPosition(source, useOffset)
    const definition = providers.definition.provideDefinition(model as never, position as never) as {
      range: { startLineNumber: number; startColumn: number }
    }
    const location = providers.rename.resolveRenameLocation(model as never, position as never) as {
      text: string
    }
    const rename = providers.rename.provideRenameEdits(model as never, position as never, 'transform' as never) as {
      edits: Array<{ versionId: number; textEdit: { text: string } }>
    }

    expect(definition.range).toMatchObject({ startLineNumber: 2, startColumn: 16 })
    expect(location.text).toBe('build')
    expect(rename.edits).toHaveLength(2)
    expect(rename.edits.every((edit) => edit.versionId === 7 && edit.textEdit.text === 'transform')).toBe(true)

    const invalid = providers.rename.provideRenameEdits(model as never, position as never, 'end' as never) as {
      rejectReason: string
      edits: unknown[]
    }
    expect(invalid).toMatchObject({ edits: [], rejectReason: expect.stringContaining('valid') })
    navigation.dispose()
  })
})
