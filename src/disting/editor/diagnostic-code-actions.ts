import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { quickFixesForDiagnostic } from '../validation/diagnostic-actions'
import { createLuaSourceIndex } from '../validation/source-index'
import type { ScriptDiagnostic, SourceRange } from '../validation/types'
import { DISTING_LUA_LANGUAGE_ID } from './disting-lua'

type MonacoApi = typeof Monaco

function intersectsMonacoRange(
  sourceRange: SourceRange,
  range: Monaco.Range | Monaco.Selection,
) {
  const sourceStartsBeforeRangeEnds = sourceRange.startLine < range.endLineNumber
    || (sourceRange.startLine === range.endLineNumber && sourceRange.startColumn <= range.endColumn)
  const sourceEndsAfterRangeStarts = sourceRange.endLine > range.startLineNumber
    || (sourceRange.endLine === range.startLineNumber && sourceRange.endColumn >= range.startColumn)
  return sourceStartsBeforeRangeEnds && sourceEndsAfterRangeStarts
}

function markerRuleId(marker: Monaco.editor.IMarkerData) {
  return typeof marker.code === 'string' ? marker.code : marker.code?.value
}

export function registerDiagnosticCodeActions(
  monaco: MonacoApi,
  model: Monaco.editor.ITextModel,
  getDiagnostics: () => readonly ScriptDiagnostic[],
) {
  return monaco.languages.registerCodeActionProvider(DISTING_LUA_LANGUAGE_ID, {
    provideCodeActions(requestModel, range, context) {
      if (requestModel !== model) return { actions: [], dispose() {} }
      const source = model.getValue()
      const index = createLuaSourceIndex(source, model.getVersionId())
      const diagnostics = getDiagnostics().filter((diagnostic) => (
        diagnostic.range && intersectsMonacoRange(diagnostic.range, range)
      ))
      const actions = diagnostics.flatMap((diagnostic) => (
        quickFixesForDiagnostic(source, diagnostic, index).map((fix) => ({
          title: fix.title,
          kind: 'quickfix',
          isPreferred: fix.preferred,
          diagnostics: context.markers.filter((marker) => markerRuleId(marker) === diagnostic.ruleId),
          edit: {
            edits: fix.edits.map((edit) => ({
              resource: model.uri,
              versionId: model.getVersionId(),
              textEdit: {
                range: new monaco.Range(
                  edit.range.startLine,
                  edit.range.startColumn,
                  edit.range.endLine,
                  edit.range.endColumn,
                ),
                text: edit.text,
              },
            })),
          },
        }))
      ))
      return { actions, dispose() {} }
    },
  })
}
