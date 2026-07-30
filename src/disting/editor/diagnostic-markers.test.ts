import { describe, expect, it } from 'vitest'
import type { ScriptDiagnostic } from '../validation/types'
import { diagnosticMarkerSignature } from './diagnostic-markers'

const diagnostic: ScriptDiagnostic = {
  id: 'static:test',
  ruleId: 'test',
  severity: 'warning',
  category: 'realtime',
  target: 'hardware',
  origin: 'static',
  message: 'Avoid work in step()',
  detail: 'The callback runs every millisecond.',
  suggestion: 'Move invariant work into init().',
  penalty: 2,
  range: {
    startLine: 4,
    startColumn: 3,
    endLine: 4,
    endColumn: 12,
  },
}

describe('diagnostic marker signatures', () => {
  it('stays stable for semantically identical diagnostic arrays', () => {
    expect(diagnosticMarkerSignature([diagnostic])).toBe(
      diagnosticMarkerSignature([{
        ...diagnostic,
        range: { ...diagnostic.range! },
      }]),
    )
  })

  it('changes for marker-visible content and ignores non-source findings', () => {
    expect(diagnosticMarkerSignature([diagnostic])).not.toBe(
      diagnosticMarkerSignature([{
        ...diagnostic,
        message: 'Changed message',
      }]),
    )
    expect(diagnosticMarkerSignature([{
      ...diagnostic,
      range: undefined,
    }])).toBe('')
  })
})
