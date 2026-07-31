import { describe, expect, it, vi } from 'vitest'
import { LuaFactory } from 'wasmoon'
import {
  DISTING_API,
  DISTING_API_BY_NAME,
  DISTING_CONSTANTS,
  DISTING_LIFECYCLE,
  DISTING_LIFECYCLE_BY_NAME,
} from '../validation/api-manifest'
import {
  apiEntryForIntelliSense,
  COMPLETE_SCRIPT_SNIPPET,
  completionEntriesForSource,
  constantEntryForIntelliSense,
  lifecycleEntryForIntelliSense,
  registerDistingIntelliSense,
} from './disting-intellisense'
import { DISTING_LUA_LANGUAGE_ID } from './disting-lua'

function expandSnippetDefaults(snippet: string) {
  return snippet.replace(/\$\{\d+:([^}]*)\}/g, '$1')
}

async function compileOnly(source: string) {
  const lua = await new LuaFactory().createEngine()
  try {
    lua.global.set('__editorSnippetSource', source)
    return await lua.doString(`
      local _, errorMessage = load(__editorSnippetSource, "@editor-snippet.lua", "t")
      return errorMessage
    `)
  } finally {
    lua.global.close()
  }
}

function cursorPosition(source: string, offset = source.length) {
  const before = source.slice(0, offset).split('\n')
  return { lineNumber: before.length, column: before.at(-1)!.length + 1 }
}

function modelFor(source: string) {
  const offsetAt = (position: { lineNumber: number; column: number }) => {
    const lines = source.split('\n')
    return lines.slice(0, position.lineNumber - 1)
      .reduce((total, line) => total + line.length + 1, 0) + position.column - 1
  }
  return {
    getValue: () => source,
    getVersionId: () => 1,
    getOffsetAt: offsetAt,
    getPositionAt: (offset: number) => cursorPosition(source, offset),
    getLineContent: (lineNumber: number) => source.split('\n')[lineNumber - 1] ?? '',
    getWordUntilPosition: (position: { lineNumber: number; column: number }) => {
      const prefix = (source.split('\n')[position.lineNumber - 1] ?? '').slice(0, position.column - 1)
      const word = prefix.match(/[A-Za-z_]\w*$/)?.[0] ?? ''
      return { word, startColumn: position.column - word.length, endColumn: position.column }
    },
    getWordAtPosition: (position: { lineNumber: number; column: number }) => {
      const line = source.split('\n')[position.lineNumber - 1] ?? ''
      for (const match of line.matchAll(/[A-Za-z_]\w*/g)) {
        if (position.column >= match.index + 1 && position.column <= match.index + match[0].length + 1) {
          return { word: match[0], startColumn: match.index + 1, endColumn: match.index + match[0].length + 1 }
        }
      }
      return null
    },
  }
}

function providerHarness() {
  const providers: Record<string, unknown> = {}
  class Range {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number

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
  const disposable = { dispose: vi.fn() }
  const monaco = {
    Range,
    languages: {
      CompletionItemKind: {
        Constant: 1,
        Field: 2,
        Function: 3,
        Method: 4,
        Snippet: 5,
        Variable: 6,
      },
      CompletionItemInsertTextRule: { InsertAsSnippet: 1 },
      registerCompletionItemProvider: vi.fn((_language: string, provider: unknown) => {
        providers.completion = provider
        return disposable
      }),
      registerHoverProvider: vi.fn((_language: string, provider: unknown) => {
        providers.hover = provider
        return disposable
      }),
      registerSignatureHelpProvider: vi.fn((_language: string, provider: unknown) => {
        providers.signature = provider
        return disposable
      }),
    },
  }
  const registration = registerDistingIntelliSense(monaco as never)
  return { providers, registration }
}

describe('Disting IntelliSense API support', () => {
  it('registers providers only for Disting Lua and disposes them idempotently', () => {
    const dispose = vi.fn()
    const languageIds: string[] = []
    const register = (languageId: string) => {
      languageIds.push(languageId)
      return { dispose }
    }
    const monaco = {
      languages: {
        registerCompletionItemProvider: vi.fn(register),
        registerHoverProvider: vi.fn(register),
        registerSignatureHelpProvider: vi.fn(register),
      },
    }

    const registration = registerDistingIntelliSense(monaco as never)
    expect(registerDistingIntelliSense(monaco as never)).toBe(registration)
    expect(languageIds).toEqual([
      DISTING_LUA_LANGUAGE_ID,
      DISTING_LUA_LANGUAGE_ID,
      DISTING_LUA_LANGUAGE_ID,
    ])

    registration.dispose()
    registration.dispose()
    expect(dispose).toHaveBeenCalledTimes(3)
  })

  it('shows non-full support levels and API-specific limitations', () => {
    const cpu = DISTING_API_BY_NAME.get('getCpuCycleCount')
    const midi = DISTING_API_BY_NAME.get('sendMIDI')

    expect(cpu && apiEntryForIntelliSense(cpu)).toMatchObject({
      detail: expect.stringContaining('browser approximation'),
      documentation: expect.stringContaining('not a Disting NT CPU-cycle measurement'),
    })
    expect(midi && apiEntryForIntelliSense(midi)).toMatchObject({
      detail: expect.stringContaining('simulator mock'),
      documentation: expect.stringContaining('not transmitted to a MIDI destination'),
    })
  })

  it('does not add a caveat to fully simulated APIs', () => {
    const drawText = DISTING_API_BY_NAME.get('drawText')
    const entry = drawText && apiEntryForIntelliSense(drawText)

    expect(entry?.detail).not.toContain('simulation')
    expect(entry?.documentation).not.toContain('Simulator support')
    expect(entry?.documentation).toContain('Contract source: manual 1.12')
  })

  it('distinguishes documented constants from compatibility aliases', () => {
    const documented = DISTING_CONSTANTS.find((entry) => entry.name === 'kMs')!
    const compatibility = DISTING_CONSTANTS.find((entry) => entry.name === 'kMilliseconds')!

    expect(constantEntryForIntelliSense(documented)).toMatchObject({
      detail: expect.stringContaining('manual 1.12'),
      documentation: expect.stringContaining('Documented by'),
    })
    expect(constantEntryForIntelliSense(compatibility)).toMatchObject({
      detail: expect.stringContaining('observed in official scripts'),
      documentation: expect.stringContaining('not documented by the 1.12 manual'),
    })
  })

  it('derives lifecycle signatures and snippets from the lifecycle catalog', () => {
    const gate = DISTING_LIFECYCLE_BY_NAME.get('gate')!
    const completion = lifecycleEntryForIntelliSense(gate)

    expect(completion).toMatchObject({
      label: 'gate callback',
      signature: 'gate = function(self, input, rising)',
      insertText: expect.stringContaining('gate = function(self, input, rising)'),
      documentation: expect.stringContaining('On each gate edge'),
    })
  })

  it('starts the complete script scaffold with both hardware header comments', () => {
    expect(COMPLETE_SCRIPT_SNIPPET.insertText?.split('\n').slice(0, 3)).toEqual([
      '-- ${1:Algorithm name}',
      '-- ${2:Describe what the script does.}',
      'local out = {}',
    ])
  })

  it('compiles default API and lifecycle snippet expansions with Lua 5.4', async () => {
    const apiCalls = DISTING_API.map((entry) => (
      expandSnippetDefaults(apiEntryForIntelliSense(entry).insertText ?? '')
    )).join('\n')
    const lifecycleFields = DISTING_LIFECYCLE.map((entry) => (
      expandSnippetDefaults(lifecycleEntryForIntelliSense(entry).insertText ?? '')
    )).join('\n')
    const completeScript = expandSnippetDefaults(COMPLETE_SCRIPT_SNIPPET.insertText ?? '')

    expect(await compileOnly(`return function()\n${apiCalls}\nend`)).toBeNull()
    expect(await compileOnly(`return {\n${lifecycleFields}\n}`)).toBeNull()
    expect(await compileOnly(completeScript)).toBeNull()
  })

  it('compiles contextual init and parameter snippets at their default values', async () => {
    const initFixture = 'return { init = function() return {\n  \n} end }'
    const initOffset = initFixture.indexOf('\n  \n') + 3
    const initSnippets = completionEntriesForSource(initFixture, initOffset)
    const parameterFixture = 'return { init = function() return { parameters = {\n  \n} } end }'
    const parameterOffset = parameterFixture.indexOf('\n  \n') + 3
    const parameterSnippets = completionEntriesForSource(parameterFixture, parameterOffset)

    for (const entry of initSnippets) {
      expect(await compileOnly(`return { init = function() return {\n${expandSnippetDefaults(entry.insertText ?? '')}\n} end }`)).toBeNull()
    }
    for (const entry of parameterSnippets) {
      expect(await compileOnly(`return { init = function() return { parameters = {\n${expandSnippetDefaults(entry.insertText ?? '')}\n} } end }`)).toBeNull()
    }
  })

  it('uses balanced signature help and exposes API overloads', () => {
    const { providers, registration } = providerHarness()
    const signature = providers.signature as {
      provideSignatureHelp(model: unknown, position: unknown): { value: {
        signatures: Array<{ label: string }>
        activeSignature: number
        activeParameter: number
      } } | null
    }
    const nested = 'drawText(2, math.max(3, 4), "text, value", 15, '
    const nestedHelp = signature.provideSignatureHelp(modelFor(nested), cursorPosition(nested))
    expect(nestedHelp?.value).toMatchObject({ activeSignature: 0, activeParameter: 4 })

    const overload = 'sendI2CCommand(0x32, { '
    const overloadHelp = signature.provideSignatureHelp(modelFor(overload), cursorPosition(overload))
    expect(overloadHelp?.value.signatures).toHaveLength(2)
    expect(overloadHelp?.value.activeSignature).toBe(1)
    registration.dispose()
  })

  it('provides parameter-specific hover details and exact word replacement ranges', () => {
    const { providers, registration } = providerHarness()
    const source = `return {
  init = function() return { parameters = { { "Depth", 0, 100, 50, kPercent } } } end,
  step = function(self) return { self.parameters[1] } end,
}`
    const hoverOffset = source.indexOf('parameters[1]') + 'parameters['.length
    const hover = (providers.hover as {
      provideHover(model: unknown, position: unknown): { contents: Array<{ value: string }> } | null
    }).provideHover(modelFor(source), cursorPosition(source, hoverOffset))
    expect(hover?.contents[1].value).toContain('Script parameter 1: Depth')

    const completionSource = 'return {\n  na\n}'
    const result = (providers.completion as {
      provideCompletionItems(model: unknown, position: unknown): { suggestions: Array<{
        label: string
        range: { startColumn: number; endColumn: number }
      }> }
    }).provideCompletionItems(modelFor(completionSource), cursorPosition(completionSource, completionSource.indexOf('\n}')))
    const name = result.suggestions.find((entry) => entry.label === 'name')
    expect(name?.range).toMatchObject({ startColumn: 3, endColumn: 5 })
    registration.dispose()
  })
})
