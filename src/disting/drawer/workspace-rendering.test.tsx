import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { RuntimeStats } from '../types'
import type {
  ScriptDiagnostic,
  ScriptQualityReport,
} from '../validation/types'
import { HealthBadge } from '../workbench/HealthBadge'
import { ConsoleWorkspace } from './ConsoleWorkspace'
import { PerformanceWorkspace } from './PerformanceWorkspace'
import { ProblemsWorkspace } from './ProblemsWorkspace'

const diagnostic: ScriptDiagnostic = {
  id: 'static:readonly',
  ruleId: 'readonly-parameters',
  severity: 'warning',
  category: 'contract',
  target: 'hardware',
  origin: 'static',
  callback: 'step',
  message: 'parameters is read-only',
  detail: 'Writes are ignored by the hardware.',
  suggestion: 'Return the desired parameter value.',
  penalty: 4,
  range: {
    startLine: 12,
    startColumn: 3,
    endLine: 12,
    endColumn: 13,
  },
}

const report: ScriptQualityReport = {
  status: 'provisional',
  score: 94,
  grade: 'A',
  profile: 'Disting NT Lua 1.12',
  categories: [
    { category: 'contract', label: 'Disting contract', maximum: 35, score: 31 },
    { category: 'realtime', label: 'Real-time safety', maximum: 35, score: 35 },
    { category: 'api', label: 'API & portability', maximum: 20, score: 20 },
    { category: 'clarity', label: 'Clarity', maximum: 10, score: 8 },
  ],
  errorCount: 0,
  warningCount: 1,
  infoCount: 0,
  sampledSteps: 240,
}

const stats: RuntimeStats = {
  simulatedSeconds: 2,
  steps: 2000,
  averageUs: 11.2,
  p95Us: 18.4,
  maxUs: 1220,
  budgetPercent: 1.12,
  droppedSteps: 3,
  callbacks: {
    step: {
      calls: 2000,
      averageUs: 8.2,
      p95Us: 13.5,
      maxUs: 820,
    },
    draw: {
      calls: 60,
      averageUs: 22,
      p95Us: 31,
      maxUs: 90,
    },
  },
}

describe('secondary drawer workspace rendering', () => {
  it('renders compact health, categories, and navigable diagnostics', () => {
    const markup = renderToStaticMarkup(
      <ProblemsWorkspace
        diagnostics={[diagnostic]}
        report={report}
        onSelectDiagnostic={() => undefined}
      />,
    )

    expect(markup).toContain('Problems workspace')
    expect(markup).toContain('94 · A')
    expect(markup).toContain('Disting NT Lua 1.12')
    expect(markup).toContain('Disting contract')
    expect(markup).toContain('parameters is read-only')
    expect(markup).toContain('Line 12')
    expect(markup).toContain('Reveal source location')
  })

  it('renders filterable typed console entries and view-only actions', () => {
    const markup = renderToStaticMarkup(
      <ConsoleWorkspace
        entries={[
          { id: 1, kind: 'error', message: 'step() failed' },
          { id: 2, kind: 'lua', message: 'hello' },
          { id: 3, kind: 'midi', message: '0x01 ← 0x90 0x3C 0x64' },
          { id: 4, kind: 'i2c', message: '0x40 ← 0x01' },
          { id: 5, kind: 'display', message: 'Mode: meters' },
        ]}
        onClear={() => undefined}
      />,
    )

    expect(markup).toContain('Console filters')
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(6)
    expect(markup).toContain('5 / 5 visible')
    expect(markup).toContain('step() failed')
    expect(markup).toContain('Clear view')
    expect(markup).toContain('Autoscroll')
  })

  it('keeps local timing context visible and exposes callback detail', () => {
    const markup = renderToStaticMarkup(<PerformanceWorkspace stats={stats} />)

    expect(markup).toContain('Average step')
    expect(markup).toContain('95th percentile')
    expect(markup).toContain('1.22 ms')
    expect(markup).toContain('Dropped steps')
    expect(markup).toContain('Callback detail')
    expect(markup).toContain('step()')
    expect(markup).toContain('draw()')
    expect(markup).toContain('not calibrated Disting NT CPU usage')
  })

  it('gives the command-bar health badge a complete accessible name', () => {
    const markup = renderToStaticMarkup(
      <HealthBadge
        label="2 errors"
        status="invalid"
        errorCount={2}
        warningCount={1}
        onOpen={() => undefined}
      />,
    )

    expect(markup).toContain('workbench-health--invalid')
    expect(markup).toContain(
      'aria-label="Open Problems workspace: 2 errors"',
    )
  })
})
