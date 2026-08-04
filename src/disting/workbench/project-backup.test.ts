import { describe, expect, it } from 'vitest'
import {
  createProjectBackup,
  parseProjectBackup,
  PROJECT_BACKUP_MAX_BYTES,
  serializeProjectBackup,
} from './project-backup'
import { createScriptProject } from './projects'

const makeProject = (id: string, filename: string, source: string) => createScriptProject({
  id, filename, source, modules: { 'mód': 'return "✓"' }, origin: { kind: 'import' }, now: 5,
})

describe('Luading project backup format', () => {
  it('round trips Unicode with stable filename/ID ordering and a trailing newline', () => {
    const backup = createProjectBackup([
      makeProject('z', 'Same.lua', '-- 你好'),
      makeProject('a', 'Same.lua', '-- café'),
    ], Date.UTC(2026, 7, 4))
    const source = serializeProjectBackup(backup)
    expect(source.endsWith('\n')).toBe(true)
    expect(parseProjectBackup(`\uFEFF${source}`)).toEqual(backup)
    expect(backup.projects.map(({ id }) => id)).toEqual(['a', 'z'])
  })

  it('rejects unsupported versions and malformed records as a complete unit', () => {
    const valid = createProjectBackup([makeProject('a', 'A.lua', '-- a')], 0)
    expect(() => parseProjectBackup(JSON.stringify({ ...valid, version: 2 }))).toThrow('not supported')
    expect(() => parseProjectBackup(JSON.stringify({ ...valid, projects: [{ ...valid.projects[0], source: 4 }] })))
      .toThrow('invalid project record')
  })

  it('rejects decoded files over the conservative size limit', () => {
    expect(() => parseProjectBackup(' '.repeat(PROJECT_BACKUP_MAX_BYTES + 1))).toThrow('10 MB')
  })
})
