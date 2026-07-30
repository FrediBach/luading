import type { RuntimeStats } from '../types'
import { DISTING_API_PROFILE } from './api-manifest'
import type {
  DiagnosticCategory,
  QualityCategoryScore,
  ScriptDiagnostic,
  ScriptQualityReport,
} from './types'

const CATEGORY_CONFIG: Array<{
  category: Exclude<DiagnosticCategory, 'compatibility'>
  label: string
  maximum: number
}> = [
  { category: 'contract', label: 'Disting contract', maximum: 35 },
  { category: 'realtime', label: 'Real-time safety', maximum: 35 },
  { category: 'api', label: 'API & portability', maximum: 20 },
  { category: 'clarity', label: 'Clarity', maximum: 10 },
]

const RULE_PENALTY_CAPS: Record<string, number> = {
  'hot-table-allocation': 9,
  'hot-string-concatenation': 8,
  'hot-expensive-call': 12,
  'hot-preset-lookup': 12,
  'readonly-parameters': 10,
}

function grade(score: number): ScriptQualityReport['grade'] {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

export function runtimePerformanceDiagnosticKey(stats: RuntimeStats) {
  if (stats.steps < 1000) return null
  const p95BudgetPercent = stats.p95Us / 10
  if (p95BudgetPercent < 25) return null
  return `${p95BudgetPercent >= 75 ? 'critical' : 'watch'}:${p95BudgetPercent.toFixed(1)}`
}

export function runtimePerformanceDiagnosticsForKey(
  key: string | null,
): ScriptDiagnostic[] {
  if (!key) return []
  const [level, percentText] = key.split(':')
  const p95BudgetPercent = Number(percentText)
  if (level === 'critical') {
    return [{
      id: 'runtime:step-p95-critical',
      ruleId: 'step-p95-critical',
      severity: 'warning',
      category: 'realtime',
      target: 'local',
      origin: 'runtime',
      callback: 'step',
      message: `step() p95 uses ${p95BudgetPercent.toFixed(1)}% of the local deadline`,
      detail: 'This browser-local measurement leaves little headroom in the 1 ms control interval. It is not calibrated to Disting NT hardware.',
      suggestion: 'Profile the hot path, reduce repeated work, and confirm the result on hardware with getCpuCycleCount().',
      penalty: 15,
    }]
  }
  if (level === 'watch') {
    return [{
      id: 'runtime:step-p95-watch',
      ruleId: 'step-p95-watch',
      severity: 'warning',
      category: 'realtime',
      target: 'local',
      origin: 'runtime',
      callback: 'step',
      message: `step() p95 uses ${p95BudgetPercent.toFixed(1)}% of the local deadline`,
      detail: 'The callback is comfortable locally but has begun to consume meaningful headroom. This measurement is not calibrated to hardware.',
      suggestion: 'Review hot-path warnings and confirm performance on the module.',
      penalty: 6,
    }]
  }
  return []
}

export function runtimePerformanceDiagnostics(stats: RuntimeStats): ScriptDiagnostic[] {
  return runtimePerformanceDiagnosticsForKey(runtimePerformanceDiagnosticKey(stats))
}

export function dedupeDiagnostics(diagnostics: ScriptDiagnostic[]) {
  const byId = new Map<string, ScriptDiagnostic>()
  for (const item of diagnostics) byId.set(item.id, item)
  return [...byId.values()].sort((left, right) => {
    const severityOrder = { error: 0, warning: 1, info: 2 }
    return severityOrder[left.severity] - severityOrder[right.severity]
      || (left.range?.startLine ?? Number.MAX_SAFE_INTEGER) - (right.range?.startLine ?? Number.MAX_SAFE_INTEGER)
      || left.message.localeCompare(right.message)
  })
}

export function calculateQualityReport(
  diagnostics: ScriptDiagnostic[],
  stats: RuntimeStats,
  sourceIsLoaded: boolean,
): ScriptQualityReport {
  const errorCount = diagnostics.filter((item) => item.severity === 'error').length
  const warningCount = diagnostics.filter((item) => item.severity === 'warning').length
  const infoCount = diagnostics.filter((item) => item.severity === 'info').length
  const penaltyByRule = new Map<string, number>()
  const penaltyByCategory = new Map<DiagnosticCategory, number>()

  for (const item of diagnostics) {
    if (item.penalty <= 0 || item.category === 'compatibility') continue
    const ruleTotal = penaltyByRule.get(item.ruleId) ?? 0
    const cap = RULE_PENALTY_CAPS[item.ruleId] ?? Number.POSITIVE_INFINITY
    const applied = Math.max(0, Math.min(item.penalty, cap - ruleTotal))
    penaltyByRule.set(item.ruleId, ruleTotal + applied)
    penaltyByCategory.set(item.category, (penaltyByCategory.get(item.category) ?? 0) + applied)
  }

  const categories: QualityCategoryScore[] = CATEGORY_CONFIG.map((config) => ({
    ...config,
    score: Math.max(0, config.maximum - (penaltyByCategory.get(config.category) ?? 0)),
  }))
  const score = Math.round(categories.reduce((total, category) => total + category.score, 0))

  return {
    status: errorCount > 0
      ? 'invalid'
      : !sourceIsLoaded
        ? 'pending'
        : stats.steps < 1000
          ? 'provisional'
          : 'scored',
    score: errorCount > 0 || !sourceIsLoaded ? null : score,
    grade: errorCount > 0 || !sourceIsLoaded ? null : grade(score),
    profile: DISTING_API_PROFILE,
    categories,
    errorCount,
    warningCount,
    infoCount,
    sampledSteps: stats.steps,
  }
}
