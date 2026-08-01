import { describe, expect, it } from 'vitest'
import {
  formatSequenceNote,
  parseSequenceNote,
} from './note-step-editor'

describe('note step editor', () => {
  it('formats signed semitone offsets as chromatic note names', () => {
    expect(formatSequenceNote(0)).toBe('C0')
    expect(formatSequenceNote(13)).toBe('C#1')
    expect(formatSequenceNote(-1)).toBe('B-1')
    expect(formatSequenceNote(-12)).toBe('C-1')
  })

  it('parses sharp, flat, natural, and numeric note entries', () => {
    expect(parseSequenceNote('C#1')).toBe(13)
    expect(parseSequenceNote('Db1')).toBe(13)
    expect(parseSequenceNote('b-1')).toBe(-1)
    expect(parseSequenceNote('-12')).toBe(-12)
    expect(parseSequenceNote('H2')).toBeNull()
    expect(parseSequenceNote('C11')).toBeNull()
    expect(parseSequenceNote('121')).toBeNull()
  })
})
