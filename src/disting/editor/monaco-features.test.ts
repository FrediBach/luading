import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Monaco visible editor features', () => {
  it('loads the UI contributions required by every registered provider', () => {
    const source = readFileSync(new URL('./monaco-features.ts', import.meta.url), 'utf8')
    const contributions = [
      'codeAction/browser/codeActionContributions.js',
      'documentSymbols/browser/documentSymbols.js',
      'folding/browser/folding.js',
      'gotoSymbol/browser/goToCommands.js',
      'gotoSymbol/browser/link/goToDefinitionAtPosition.js',
      'hover/browser/hoverContribution.js',
      'parameterHints/browser/parameterHints.js',
      'rename/browser/rename.js',
      'snippet/browser/snippetController2.js',
      'suggest/browser/suggestController.js',
      'quickAccess/standaloneGotoSymbolQuickAccess.js',
      'referenceSearch/standaloneReferenceSearch.js',
    ]

    for (const contribution of contributions) expect(source).toContain(contribution)
  })

  it('loads feature contributions before registering the language providers', () => {
    const source = readFileSync(new URL('./monaco.ts', import.meta.url), 'utf8')

    expect(source.indexOf("import './monaco-features'")).toBeGreaterThanOrEqual(0)
    expect(source.indexOf("import './monaco-features'"))
      .toBeLessThan(source.indexOf('registerDistingIntelliSense(monaco)'))
  })
})
