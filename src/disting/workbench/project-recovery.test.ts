import { describe, expect, it } from 'vitest'
import {
  clearRecoveryJournal,
  PROJECT_RECOVERY_KEY,
  readRecoveryJournal,
  writeRecoveryJournal,
  type RecoveryStorage,
} from './project-recovery'

function storage(): RecoveryStorage & { value?: string } {
  return {
    getItem() { return this.value ?? null },
    setItem(_key, value) { this.value = value },
    removeItem() { this.value = undefined },
  }
}

describe('active source recovery journal', () => {
  it('round trips only the compact validated active source', () => {
    const target = storage()
    const journal = {
      version: 1 as const,
      document: { kind: 'project' as const, projectId: 'one' },
      filename: 'One.lua', source: '-- latest', revision: 3, updatedAt: 20,
    }
    expect(writeRecoveryJournal(target, journal)).toBe(true)
    expect(readRecoveryJournal(target)).toEqual(journal)
    clearRecoveryJournal(target, 2)
    expect(target.value).toBeDefined()
    clearRecoveryJournal(target, 3)
    expect(target.value).toBeUndefined()
  })

  it('quarantines malformed journal JSON without throwing', () => {
    const target = storage()
    target.value = '{bad'
    expect(readRecoveryJournal(target)).toBeUndefined()
    target.value = JSON.stringify({ version: 1, filename: '../bad.lua' })
    expect(readRecoveryJournal(target)).toBeUndefined()
    expect(PROJECT_RECOVERY_KEY).toContain('recovery')
  })
})
