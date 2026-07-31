import { describe, expect, it } from 'vitest'
import type { ScriptDiagnostic } from '../validation/types'
import {
  clampDiagnosticRange,
  diagnosticMarkerSignature,
  DIAGNOSTIC_MARKER_OWNERS,
  prepareDiagnosticMarkers,
} from './diagnostic-markers'

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

  it('clamps invalid lines and columns to the current model', () => {
    expect(clampDiagnosticRange({
      startLine: -4,
      startColumn: 99,
      endLine: 40,
      endColumn: 99,
    }, 'abc\nx')).toEqual({
      startLine: 1,
      startColumn: 4,
      endLine: 2,
      endColumn: 2,
    })
    expect(clampDiagnosticRange({
      startLine: 2,
      startColumn: 2,
      endLine: 1,
      endColumn: 1,
    }, 'abc\nx')).toEqual({
      startLine: 2,
      startColumn: 2,
      endLine: 2,
      endColumn: 2,
    })
  })

  it('separates marker owners and includes contract profile and origin', () => {
    const markers = prepareDiagnosticMarkers([
      diagnostic,
      { ...diagnostic, id: 'runtime:test', origin: 'runtime' },
    ], 'one\ntwo\nthree\nfour')

    expect(markers.map((marker) => marker.owner)).toEqual([
      DIAGNOSTIC_MARKER_OWNERS.static,
      DIAGNOSTIC_MARKER_OWNERS.runtime,
    ])
    expect(markers.map((marker) => marker.source)).toEqual([
      'Disting NT Lua 1.12 · static',
      'Disting NT Lua 1.12 · runtime',
    ])
  })

  it('keeps marker text concise when Problems-only details change', () => {
    expect(diagnosticMarkerSignature([diagnostic])).toBe(
      diagnosticMarkerSignature([{
        ...diagnostic,
        detail: 'A more detailed Problems explanation.',
        suggestion: 'A different suggested action.',
      }]),
    )
  })
})
