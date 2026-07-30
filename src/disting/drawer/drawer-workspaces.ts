import type { RuntimeStats } from '../types'
import type { ScriptDiagnostic, SourceRange } from '../validation/types'
import type { DrawerTabId } from '../workbench/workbench-layout'

export const MAX_CONSOLE_ENTRIES = 200
export const MAX_RENDERED_DIAGNOSTICS = 100

export type ConsoleEntryKind = 'error' | 'lua' | 'midi' | 'i2c' | 'display'

export interface ConsoleEntry {
  id: number
  kind: ConsoleEntryKind
  message: string
}

export type ConsoleFilters = Record<ConsoleEntryKind, boolean>

export interface BlockingState {
  runtimeError: string | null
  diagnosticErrorCount: number
}

export const DEFAULT_CONSOLE_FILTERS: ConsoleFilters = {
  error: true,
  lua: true,
  midi: true,
  i2c: true,
  display: true,
}

export function boundConsoleEntries(entries: ConsoleEntry[]) {
  return entries.slice(-MAX_CONSOLE_ENTRIES)
}

export function filterConsoleEntries(
  entries: ConsoleEntry[],
  filters: ConsoleFilters,
) {
  return entries.filter((entry) => filters[entry.kind])
}

export function boundedDiagnostics(diagnostics: ScriptDiagnostic[]) {
  return diagnostics.slice(0, MAX_RENDERED_DIAGNOSTICS)
}

export function diagnosticLocation(diagnostic: ScriptDiagnostic) {
  if (diagnostic.range) return `Line ${diagnostic.range.startLine}`
  return diagnostic.callback ? `${diagnostic.callback}()` : ''
}

export function diagnosticRevealRequest(
  diagnostic: ScriptDiagnostic,
  nonce: number,
): { range: SourceRange; nonce: number } | undefined {
  return diagnostic.range ? { range: diagnostic.range, nonce } : undefined
}

export function blockingDrawerTab(
  previous: BlockingState,
  current: BlockingState,
): DrawerTabId | null {
  if (current.runtimeError && current.runtimeError !== previous.runtimeError) {
    return 'console'
  }
  if (current.diagnosticErrorCount > previous.diagnosticErrorCount) {
    return 'problems'
  }
  return null
}

export function formatDuration(microseconds: number) {
  return microseconds < 1000
    ? `${microseconds.toFixed(1)} µs`
    : `${(microseconds / 1000).toFixed(2)} ms`
}

export function performanceBudgetState(
  budgetPercent: RuntimeStats['budgetPercent'],
) {
  return budgetPercent < 25
    ? 'comfortable'
    : budgetPercent < 75
      ? 'watch'
      : 'over'
}
