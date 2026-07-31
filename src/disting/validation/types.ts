import type { DistingLifecycleName } from './api-manifest'

export type DiagnosticSeverity = 'error' | 'warning' | 'info'
export type DiagnosticCategory = 'contract' | 'realtime' | 'api' | 'clarity' | 'compatibility'
export type DiagnosticTarget = 'hardware' | 'simulator' | 'local'
export type DiagnosticOrigin = 'static' | 'contract' | 'runtime'

export type LuaCallbackName = DistingLifecycleName

export interface SourceRange {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

export interface ScriptDiagnostic {
  id: string
  ruleId: string
  severity: DiagnosticSeverity
  category: DiagnosticCategory
  target: DiagnosticTarget
  origin: DiagnosticOrigin
  message: string
  detail: string
  suggestion?: string
  penalty: number
  range?: SourceRange
  callback?: LuaCallbackName
}

export interface QualityCategoryScore {
  category: Exclude<DiagnosticCategory, 'compatibility'>
  label: string
  maximum: number
  score: number
}

export interface ScriptQualityReport {
  status: 'pending' | 'invalid' | 'provisional' | 'scored'
  score: number | null
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null
  profile: string
  categories: QualityCategoryScore[]
  errorCount: number
  warningCount: number
  infoCount: number
  sampledSteps: number
}

export interface ValidationWorkerRequest {
  type: 'validate'
  source: string
  version: number
}

export interface ValidationWorkerResponse {
  type: 'validated'
  diagnostics: ScriptDiagnostic[]
  version: number
}
