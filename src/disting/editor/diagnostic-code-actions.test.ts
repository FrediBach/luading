import { describe, expect, it, vi } from 'vitest'
import { validateLuaSource } from '../validation/static-validator'
import { registerDiagnosticCodeActions } from './diagnostic-code-actions'
import { DISTING_LUA_LANGUAGE_ID } from './disting-lua'

describe('diagnostic code-action adapter', () => {
  it('maps domain edits to Monaco quick fixes for the registered model only', () => {
    const source = `-- Draw
-- Missing colour.
return { draw = function()
  drawLine(0, 0, 4, 8)
end }`
    const diagnostics = validateLuaSource(source)
    let provider: {
      provideCodeActions(model: unknown, range: unknown, context: unknown): {
        actions: Array<{
          title: string
          kind: string
          isPreferred?: boolean
          edit: { edits: Array<{ textEdit: { text: string } }> }
        }>
      }
    } | undefined
    class Range {
      startLineNumber: number
      startColumn: number
      endLineNumber: number
      endColumn: number

      constructor(startLine: number, startColumn: number, endLine: number, endColumn: number) {
        this.startLineNumber = startLine
        this.startColumn = startColumn
        this.endLineNumber = endLine
        this.endColumn = endColumn
      }
    }
    const registration = { dispose: vi.fn() }
    const monaco = {
      Range,
      languages: {
        registerCodeActionProvider: vi.fn((languageId: string, value: typeof provider) => {
          expect(languageId).toBe(DISTING_LUA_LANGUAGE_ID)
          provider = value
          return registration
        }),
      },
    }
    const model = {
      uri: { toString: () => 'inmemory://disting/main.lua' },
      getValue: () => source,
      getVersionId: () => 4,
    }
    expect(registerDiagnosticCodeActions(
      monaco as never,
      model as never,
      () => diagnostics,
    )).toBe(registration)

    const diagnostic = diagnostics.find((entry) => entry.ruleId === 'api-argument-count')!
    const range = {
      startLineNumber: diagnostic.range!.startLine,
      startColumn: diagnostic.range!.startColumn,
      endLineNumber: diagnostic.range!.endLine,
      endColumn: diagnostic.range!.endColumn,
    }
    const result = provider!.provideCodeActions(model, range, {
      markers: [{ code: diagnostic.ruleId }],
    })
    expect(result.actions).toEqual([
      expect.objectContaining({
        title: 'Add full-bright drawing colour (15)',
        kind: 'quickfix',
        isPreferred: true,
        edit: {
          edits: [expect.objectContaining({
            textEdit: expect.objectContaining({ text: ', 15' }),
          })],
        },
      }),
    ])
    expect(provider!.provideCodeActions({}, range, { markers: [] }).actions).toEqual([])
  })
})
