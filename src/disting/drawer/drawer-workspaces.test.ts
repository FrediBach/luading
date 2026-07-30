import { describe, expect, it } from 'vitest'
import type { ScriptDiagnostic } from '../validation/types'
import {
  blockingDrawerTab,
  boundConsoleEntries,
  DEFAULT_CONSOLE_FILTERS,
  diagnosticRevealRequest,
  filterConsoleEntries,
  MAX_CONSOLE_ENTRIES,
  performanceBudgetState,
} from './drawer-workspaces'

const diagnostic: ScriptDiagnostic = {
  id: 'static:test',
  ruleId: 'test',
  severity: 'error',
  category: 'contract',
  target: 'hardware',
  origin: 'static',
  message: 'Test error',
  detail: 'A test detail.',
  penalty: 2,
  range: {
    startLine: 7,
    startColumn: 2,
    endLine: 7,
    endColumn: 8,
  },
}

describe('drawer workspace helpers', () => {
  it('opens the appropriate drawer only for a new blocking condition', () => {
    const clear = { runtimeError: null, diagnosticErrorCount: 0 }

    expect(blockingDrawerTab(clear, {
      runtimeError: null,
      diagnosticErrorCount: 1,
    })).toBe('problems')
    expect(blockingDrawerTab(clear, {
      runtimeError: 'Lua failed',
      diagnosticErrorCount: 1,
    })).toBe('console')
    expect(blockingDrawerTab({
      runtimeError: 'Lua failed',
      diagnosticErrorCount: 1,
    }, {
      runtimeError: 'Lua failed',
      diagnosticErrorCount: 1,
    })).toBeNull()
  })

  it('creates reveal requests only for source diagnostics', () => {
    expect(diagnosticRevealRequest(diagnostic, 42)).toEqual({
      range: diagnostic.range,
      nonce: 42,
    })
    expect(diagnosticRevealRequest({ ...diagnostic, range: undefined }, 42)).toBeUndefined()
  })

  it('filters and bounds the console without changing source entries', () => {
    const entries = Array.from({ length: MAX_CONSOLE_ENTRIES + 5 }, (_, index) => ({
      id: index,
      kind: index % 2 === 0 ? 'lua' as const : 'midi' as const,
      message: `Entry ${index}`,
    }))
    const bounded = boundConsoleEntries(entries)

    expect(bounded).toHaveLength(MAX_CONSOLE_ENTRIES)
    expect(bounded[0]?.id).toBe(5)
    expect(filterConsoleEntries(bounded, {
      ...DEFAULT_CONSOLE_FILTERS,
      midi: false,
    }).every((entry) => entry.kind === 'lua')).toBe(true)
    expect(entries).toHaveLength(MAX_CONSOLE_ENTRIES + 5)
  })

  it('classifies the local timing budget at the documented thresholds', () => {
    expect(performanceBudgetState(24.99)).toBe('comfortable')
    expect(performanceBudgetState(25)).toBe('watch')
    expect(performanceBudgetState(75)).toBe('over')
  })
})
