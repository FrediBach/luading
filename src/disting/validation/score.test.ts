import { describe, expect, it } from 'vitest'
import type { RuntimeStats } from '../types'
import {
  calculateQualityReport,
  runtimePerformanceDiagnostics,
} from './score'
import type { ScriptDiagnostic } from './types'

const EMPTY_STATS: RuntimeStats = {
  simulatedSeconds: 0,
  steps: 0,
  averageUs: 0,
  p95Us: 0,
  maxUs: 0,
  budgetPercent: 0,
  droppedSteps: 0,
  callbacks: {},
}

function finding(values: Partial<ScriptDiagnostic> = {}): ScriptDiagnostic {
  return {
    id: 'test:finding',
    ruleId: 'test-finding',
    severity: 'warning',
    category: 'realtime',
    target: 'hardware',
    origin: 'static',
    message: 'Finding',
    detail: 'Test finding.',
    penalty: 5,
    ...values,
  }
}

describe('calculateQualityReport', () => {
  it('does not show a number until the current source has loaded', () => {
    const report = calculateQualityReport([], EMPTY_STATS, false)
    expect(report.status).toBe('pending')
    expect(report.score).toBeNull()
  })

  it('suppresses the score for invalid scripts', () => {
    const report = calculateQualityReport([
      finding({ severity: 'error', penalty: 0 }),
    ], EMPTY_STATS, true)
    expect(report.status).toBe('invalid')
    expect(report.score).toBeNull()
  })

  it('does not penalize simulator compatibility notes', () => {
    const report = calculateQualityReport([
      finding({
        category: 'compatibility',
        severity: 'info',
        target: 'simulator',
        penalty: 50,
      }),
    ], { ...EMPTY_STATS, steps: 1000 }, true)
    expect(report.score).toBe(100)
    expect(report.grade).toBe('A')
  })

  it('caps repeated hot-table penalties', () => {
    const findings = Array.from({ length: 10 }, (_, index) => finding({
      id: `test:${index}`,
      ruleId: 'hot-table-allocation',
      penalty: 3,
    }))
    const report = calculateQualityReport(findings, { ...EMPTY_STATS, steps: 1000 }, true)
    expect(report.categories.find((item) => item.category === 'realtime')?.score).toBe(26)
  })

  it('keeps runtime timing provisional until 1,000 steps', () => {
    const report = calculateQualityReport([], { ...EMPTY_STATS, steps: 999 }, true)
    expect(report.status).toBe('provisional')
    expect(report.score).toBe(100)
  })
})

describe('runtimePerformanceDiagnostics', () => {
  it('labels timing as a local measurement', () => {
    const findings = runtimePerformanceDiagnostics({
      ...EMPTY_STATS,
      steps: 1000,
      p95Us: 800,
    })
    expect(findings[0]).toMatchObject({
      ruleId: 'step-p95-critical',
      target: 'local',
      penalty: 15,
    })
  })
})
