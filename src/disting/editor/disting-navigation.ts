import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { createLuaSourceIndex, type LuaSourceIndex } from '../validation/source-index'
import type { SourceRange } from '../validation/types'
import { DISTING_LUA_LANGUAGE_ID } from './disting-lua'
import {
  documentSymbolsForSource,
  foldingRangesForSource,
  isValidLuaIdentifier,
  resolvedLocalSymbolAt,
  type DistingDocumentSymbol,
} from './disting-navigation-context'

type MonacoApi = typeof Monaco

function monacoRange(monaco: MonacoApi, range: SourceRange) {
  return new monaco.Range(
    range.startLine,
    range.startColumn,
    range.endLine,
    range.endColumn,
  )
}

function symbolKind(monaco: MonacoApi, symbol: DistingDocumentSymbol) {
  if (symbol.kind === 'callback') return monaco.languages.SymbolKind.Method
  if (symbol.kind === 'function') return monaco.languages.SymbolKind.Function
  if (symbol.kind === 'parameter') return monaco.languages.SymbolKind.Variable
  return monaco.languages.SymbolKind.Field
}

function monacoDocumentSymbol(
  monaco: MonacoApi,
  symbol: DistingDocumentSymbol,
): Monaco.languages.DocumentSymbol {
  return {
    name: symbol.name,
    detail: symbol.detail,
    kind: symbolKind(monaco, symbol),
    tags: [],
    range: monacoRange(monaco, symbol.range),
    selectionRange: monacoRange(monaco, symbol.selectionRange),
    children: symbol.children?.map((child) => monacoDocumentSymbol(monaco, child)),
  }
}

let activeRegistration: { monaco: MonacoApi; disposable: Monaco.IDisposable } | undefined

export function registerDistingNavigation(monaco: MonacoApi) {
  if (activeRegistration?.monaco === monaco) return activeRegistration.disposable

  activeRegistration?.disposable.dispose()
  const disposables: Monaco.IDisposable[] = []
  const indexes = new WeakMap<Monaco.editor.ITextModel, { version: number; index: LuaSourceIndex }>()
  const sourceIndex = (model: Monaco.editor.ITextModel) => {
    const version = model.getVersionId()
    const cached = indexes.get(model)
    if (cached?.version === version) return cached.index
    const index = createLuaSourceIndex(model.getValue(), version)
    indexes.set(model, { version, index })
    return index
  }
  const resolvedAt = (model: Monaco.editor.ITextModel, position: Monaco.Position) => (
    resolvedLocalSymbolAt(model.getValue(), model.getOffsetAt(position), sourceIndex(model))
  )

  disposables.push(monaco.languages.registerDocumentSymbolProvider(DISTING_LUA_LANGUAGE_ID, {
    displayName: 'Disting Lua',
    provideDocumentSymbols(model) {
      return documentSymbolsForSource(model.getValue(), sourceIndex(model))
        .map((symbol) => monacoDocumentSymbol(monaco, symbol))
    },
  }))

  disposables.push(monaco.languages.registerDefinitionProvider(DISTING_LUA_LANGUAGE_ID, {
    provideDefinition(model, position) {
      const resolved = resolvedAt(model, position)
      return resolved ? {
        uri: model.uri,
        range: monacoRange(monaco, resolved.definition.selectionRange),
      } : null
    },
  }))

  disposables.push(monaco.languages.registerRenameProvider(DISTING_LUA_LANGUAGE_ID, {
    resolveRenameLocation(model, position) {
      const resolved = resolvedAt(model, position)
      return resolved ? {
        range: monacoRange(monaco, resolved.references.find((range) => {
          const offset = model.getOffsetAt(position)
          const start = model.getOffsetAt({
            lineNumber: range.startLine,
            column: range.startColumn,
          })
          const end = model.getOffsetAt({
            lineNumber: range.endLine,
            column: range.endColumn,
          })
          return offset >= start && offset <= end
        }) ?? resolved.definition.selectionRange),
        text: resolved.definition.name,
      } : null
    },
    provideRenameEdits(model, position, newName) {
      if (!isValidLuaIdentifier(newName)) {
        return { edits: [], rejectReason: 'Enter a valid non-keyword Lua identifier.' }
      }
      const resolved = resolvedAt(model, position)
      if (!resolved) {
        return { edits: [], rejectReason: 'Only confidently resolved local Lua symbols can be renamed.' }
      }
      return {
        edits: resolved.references.map((range) => ({
          resource: model.uri,
          versionId: model.getVersionId(),
          textEdit: {
            range: monacoRange(monaco, range),
            text: newName,
          },
        })),
      }
    },
  }))

  disposables.push(monaco.languages.registerFoldingRangeProvider(DISTING_LUA_LANGUAGE_ID, {
    provideFoldingRanges(model) {
      return foldingRangesForSource(sourceIndex(model)).map((range) => ({
        start: range.startLine,
        end: range.endLine,
        kind: monaco.languages.FoldingRangeKind.Region,
      }))
    },
  }))

  let disposed = false
  const disposable = {
    dispose() {
      if (disposed) return
      disposed = true
      for (const item of disposables.toReversed()) item.dispose()
      if (activeRegistration?.disposable === disposable) activeRegistration = undefined
    },
  }
  activeRegistration = { monaco, disposable }
  return disposable
}
