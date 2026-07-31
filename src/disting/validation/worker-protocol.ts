import type {
  ScriptDiagnostic,
  ValidationWorkerResponse,
} from './types'
import type { LuaSourceIndex } from './source-index'

export function createValidationResponse(
  version: number,
  diagnostics: ScriptDiagnostic[],
  sourceIndex: LuaSourceIndex,
): ValidationWorkerResponse {
  return { type: 'validated', version, diagnostics, sourceIndex }
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
