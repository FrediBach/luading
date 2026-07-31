import type {
  ScriptDiagnostic,
  ValidationWorkerResponse,
} from './types'

export function createValidationResponse(
  version: number,
  diagnostics: ScriptDiagnostic[],
): ValidationWorkerResponse {
  return { type: 'validated', version, diagnostics }
}

export function isCurrentValidationResponse(
  response: ValidationWorkerResponse,
  currentVersion: number,
) {
  return response.type === 'validated' && response.version === currentVersion
}

export function clearOutdatedSyntaxDiagnostics(
  diagnostics: readonly ScriptDiagnostic[],
) {
  return diagnostics.filter((diagnostic) => diagnostic.origin !== 'syntax')
}
