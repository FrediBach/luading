import { describe, expect, it } from 'vitest'
import type { RuntimeStats } from '../types'
import {
  calculateQualityReport,
  dedupeDiagnostics,
  runtimePerformanceDiagnosticKey,
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

function findingsForPenalty(total: number) {
  const categories: Array<[ScriptDiagnostic['category'], number]> = [
    ['realtime', 35],
    ['contract', 35],
    ['api', 20],
    ['clarity', 10],
  ]
  let remaining = total
  return categories.flatMap(([category, maximum], index) => {
    const penalty = Math.min(remaining, maximum)
    remaining -= penalty
    return penalty > 0
      ? [finding({
          id: `grade:${index}`,
          ruleId: `grade-${index}`,
          penalty,
          category,
        })]
      : []
  })
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

  it.each([
    [10, 90, 'A'],
    [20, 80, 'B'],
    [30, 70, 'C'],
    [40, 60, 'D'],
    [50, 50, 'F'],
  ] as const)('maps a %d-point penalty to score %d and grade %s', (penalty, score, grade) => {
    const report = calculateQualityReport(
      findingsForPenalty(penalty),
      { ...EMPTY_STATS, steps: 1000 },
      true,
    )

    expect(report.score).toBe(score)
    expect(report.grade).toBe(grade)
  })

  it('caps category deductions and reports finding counts', () => {
    const report = calculateQualityReport([
      finding({
        id: 'contract:huge',
        ruleId: 'huge-contract-penalty',
        category: 'contract',
        penalty: 100,
      }),
      finding({ id: 'warning', penalty: 0 }),
      finding({ id: 'info', severity: 'info', penalty: 0 }),
    ], { ...EMPTY_STATS, steps: 1000 }, true)

    expect(report.categories.find((item) => item.category === 'contract')).toMatchObject({
      score: 0,
      maximum: 35,
    })
    expect(report).toMatchObject({
      score: 65,
      errorCount: 0,
      warningCount: 2,
      infoCount: 1,
      profile: 'Disting NT Lua 1.12',
    })
  })
})

describe('runtimePerformanceDiagnostics', () => {
  it('uses a stable key while no timing diagnostic is visible', () => {
    expect(runtimePerformanceDiagnosticKey({
      ...EMPTY_STATS,
      steps: 10,
      p95Us: 900,
    })).toBeNull()
    expect(runtimePerformanceDiagnosticKey({
      ...EMPTY_STATS,
      steps: 1000,
      p95Us: 249.9,
    })).toBeNull()
    expect(runtimePerformanceDiagnosticKey({
      ...EMPTY_STATS,
      steps: 1000,
      p95Us: 250.1,
    })).toBe('watch:25.0')
    expect(runtimePerformanceDiagnostics({
      ...EMPTY_STATS,
      steps: 1000,
      p95Us: 749.6,
    })[0]?.ruleId).toBe('step-p95-watch')
  })

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

  it('emits a watch finding at 25% and no finding below it', () => {
    expect(runtimePerformanceDiagnostics({
      ...EMPTY_STATS,
      steps: 1000,
      p95Us: 250,
    })[0]).toMatchObject({
      ruleId: 'step-p95-watch',
      penalty: 6,
    })
    expect(runtimePerformanceDiagnostics({
      ...EMPTY_STATS,
      steps: 1000,
      p95Us: 249.9,
    })).toEqual([])
  })
})

describe('dedupeDiagnostics', () => {
  it('keeps the latest diagnostic per id and sorts by severity, line, and message', () => {
    const diagnostics = dedupeDiagnostics([
      finding({ id: 'same', message: 'Old', severity: 'info' }),
      finding({ id: 'info', message: 'Info', severity: 'info' }),
      finding({
        id: 'late',
        message: 'Zulu',
        severity: 'warning',
        range: { startLine: 8, startColumn: 1, endLine: 8, endColumn: 2 },
      }),
      finding({
        id: 'early',
        message: 'Alpha',
        severity: 'warning',
        range: { startLine: 2, startColumn: 1, endLine: 2, endColumn: 2 },
      }),
      finding({ id: 'same', message: 'Error', severity: 'error' }),
    ])

    expect(diagnostics.map((item) => item.message)).toEqual([
      'Error',
      'Alpha',
      'Zulu',
      'Info',
    ])
  })
})
