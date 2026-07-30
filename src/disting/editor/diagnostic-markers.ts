import type { ScriptDiagnostic } from '../validation/types'

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
        diagnostic.severity,
        diagnostic.message,
        diagnostic.detail,
        diagnostic.suggestion ?? '',
        range?.startLine ?? 0,
        range?.startColumn ?? 0,
        range?.endLine ?? 0,
        range?.endColumn ?? 0,
      ].join('\u001f')
    })
    .join('\u001e')
}
