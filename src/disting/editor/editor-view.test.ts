import { describe, expect, it } from 'vitest'
import { clampEditorViewToSource, editorOffset } from './editor-view'

describe('editor view restoration', () => {
  it('clamps a snapshot to the hydrated document before applying it', () => {
    expect(clampEditorViewToSource(
      { line: 99, column: 99, scrollTop: 20, scrollLeft: 3 },
      'one\ntwo',
    )).toEqual({ line: 2, column: 4, scrollTop: 20, scrollLeft: 3 })
  })

  it('maps line and column to the textarea fallback offset', () => {
    expect(editorOffset('one\ntwo\nthree', {
      line: 2, column: 2, scrollTop: 0, scrollLeft: 0,
    })).toBe(5)
  })
})
