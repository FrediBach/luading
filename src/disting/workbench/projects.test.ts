import { describe, expect, it } from 'vitest'
import {
  allocateProjectFilename,
  createScriptProject,
  normalizeEditorView,
  resolveActiveDocument,
  sortProjectsByRecent,
  validateScriptProject,
} from './projects'

const project = (id: string, filename: string, lastOpenedAt = 10) => createScriptProject({
  id,
  filename,
  source: `-- ${id}`,
  origin: { kind: 'new' },
  now: lastOpenedAt,
})

describe('local script project model', () => {
  it('normalizes names and allocates deterministic suffixes case-insensitively', () => {
    expect(allocateProjectFilename('Bad/name', [
      project('1', 'Bad-name.lua'),
      project('2', 'bad-name 2.lua'),
    ])).toBe('Bad-name 3.lua')
  })

  it('validates without normalizing malformed stored records', () => {
    const valid = project('one', 'One.lua')
    expect(validateScriptProject(valid)).toEqual(valid)
    expect(validateScriptProject({ ...valid, filename: '../One.lua' })).toBeUndefined()
    expect(validateScriptProject({ ...valid, modules: { helper: 4 } })).toBeUndefined()
    expect(validateScriptProject({ ...valid, revision: 0 })).toBeUndefined()
  })

  it('clones modules and resolves active fallbacks by recency', () => {
    const older = project('older', 'A.lua', 1)
    const newer = project('newer', 'B.lua', 2)
    const projects = sortProjectsByRecent([older, newer])
    projects[0].modules.changed = 'yes'
    expect(newer.modules).toEqual({})
    expect(resolveActiveDocument([older, newer], { kind: 'project', projectId: 'missing' }, () => false, 'default'))
      .toEqual({ kind: 'project', projectId: 'newer' })
    expect(resolveActiveDocument([], undefined, () => false, 'default'))
      .toEqual({ kind: 'bundled', exampleId: 'default' })
  })

  it('repairs editor positions to finite Monaco-compatible values', () => {
    expect(normalizeEditorView({ line: 0, column: 2.9, scrollTop: -4, scrollLeft: Number.NaN }))
      .toEqual({ line: 1, column: 2, scrollTop: 0, scrollLeft: 0 })
  })
})
