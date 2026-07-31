import { DISTING_API_PROFILE } from '../validation/api-manifest'
import type {
  DiagnosticOrigin,
  ScriptDiagnostic,
  SourceRange,
} from '../validation/types'

export const DIAGNOSTIC_MARKER_OWNERS: Record<DiagnosticOrigin, string> = {
  syntax: 'disting-syntax',
  static: 'disting-static',
  contract: 'disting-contract',
  runtime: 'disting-runtime',
}

export interface PreparedDiagnosticMarker {
  diagnostic: ScriptDiagnostic
  owner: string
  range: SourceRange
  source: string
}

export function clampDiagnosticRange(range: SourceRange, source: string): SourceRange {
  const lines = source.split('\n')
  const clampLine = (line: number) => Math.max(1, Math.min(lines.length, Math.trunc(line) || 1))
  const startLine = clampLine(range.startLine)
  let endLine = clampLine(range.endLine)
  if (endLine < startLine) endLine = startLine
  const clampColumn = (line: number, column: number) => (
    Math.max(1, Math.min((lines[line - 1]?.length ?? 0) + 1, Math.trunc(column) || 1))
  )
  const startColumn = clampColumn(startLine, range.startColumn)
  let endColumn = clampColumn(endLine, range.endColumn)
  if (endLine === startLine && endColumn < startColumn) endColumn = startColumn
  return { startLine, startColumn, endLine, endColumn }
}

export function prepareDiagnosticMarkers(
  diagnostics: readonly ScriptDiagnostic[],
  source: string,
) {
  return diagnostics.flatMap((diagnostic): PreparedDiagnosticMarker[] => (
    diagnostic.range ? [{
      diagnostic,
      owner: DIAGNOSTIC_MARKER_OWNERS[diagnostic.origin],
      range: clampDiagnosticRange(diagnostic.range, source),
      source: `${DISTING_API_PROFILE} · ${diagnostic.origin}`,
    }] : []
  ))
}

export function diagnosticMarkerSignature(
  diagnostics: readonly ScriptDiagnostic[],
) {
  return diagnostics
    .filter((diagnostic) => diagnostic.range)
    .map((diagnostic) => {
      const range = diagnostic.range
      return [
        diagnostic.id,
        diagnostic.ruleId,
        diagnostic.origin,
        diagnostic.severity,
        diagnostic.message,
        range?.startLine ?? 0,
        range?.startColumn ?? 0,
        range?.endLine ?? 0,
        range?.endColumn ?? 0,
      ].join('\u001f')
    })
    .join('\u001e')
}
