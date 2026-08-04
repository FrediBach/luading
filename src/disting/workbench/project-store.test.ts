import { describe, expect, it } from 'vitest'
import { createProjectBackup } from './project-backup'
import { MemoryProjectStore } from './project-store'
import { createScriptProject } from './projects'

const makeProject = (id: string, filename = `${id}.lua`) => createScriptProject({
  id,
  filename,
  source: `return { name = "${id}" }`,
  modules: { helper: `return "${id}"` },
  origin: { kind: 'new' },
  now: 10,
})

describe('project persistence contract', () => {
  it('advances a revision only after a successful source save', async () => {
    const store = new MemoryProjectStore()
    await store.createProject(makeProject('one'))
    const result = await store.saveProject({
      projectId: 'one', expectedRevision: 1, source: '-- changed', modules: {},
      filename: 'one.lua', now: 20, conflictId: 'conflict',
    })
    expect(result.kind).toBe('saved')
    expect(result.project.revision).toBe(2)
    const metadataOnly = await store.updateProjectMetadata({
      projectId: 'one', now: 30, editorView: { line: 2, column: 3, scrollTop: 4, scrollLeft: 5 },
    })
    expect(metadataOnly.revision).toBe(2)
  })

  it('forks a stale edit instead of overwriting a newer revision', async () => {
    const store = new MemoryProjectStore()
    await store.createProject(makeProject('one'))
    await store.saveProject({
      projectId: 'one', expectedRevision: 1, source: '-- tab one', modules: {},
      filename: 'one.lua', now: 20, conflictId: 'unused',
    })
    const conflict = await store.saveProject({
      projectId: 'one', expectedRevision: 1, source: '-- tab two', modules: {},
      filename: 'one.lua', now: 21, conflictId: 'conflict',
    })
    expect(conflict).toMatchObject({
      kind: 'conflict',
      project: { id: 'conflict', source: '-- tab two', revision: 1 },
      storedProject: { id: 'one', source: '-- tab one', revision: 2 },
    })
  })

  it('soft deletes, falls back, and restores without purging source', async () => {
    const store = new MemoryProjectStore()
    await store.createProject(makeProject('older'))
    await store.createProject(makeProject('active'))
    expect(await store.softDeleteProject('active', 50)).toEqual({ kind: 'project', projectId: 'older' })
    expect((await store.hydrate()).projects.find(({ id }) => id === 'active')?.deletedAt).toBe(50)
    expect((await store.restoreProject('active')).deletedAt).toBeUndefined()
  })

  it('restores backups additively, skipping equivalent ID collisions and renaming others', async () => {
    const existing = makeProject('one', 'Shared.lua')
    const changed = { ...makeProject('two', 'Shared.lua'), source: '-- other' }
    const backup = createProjectBackup([existing, changed], 100)
    const store = new MemoryProjectStore({ projects: [existing] })
    const result = await store.importBackup(backup, () => 'new-id', 200)
    expect(result.skipped).toBe(1)
    expect(result.renamed).toBe(1)
    expect(result.created[0]).toMatchObject({ id: 'two', filename: 'Shared 2.lua', source: '-- other' })
  })
})
