// @vitest-environment jsdom

import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryProjectStore, type ProjectSaveRequest } from './project-store'
import type { ProjectTemplate } from './projects'
import { useProjectLibrary, type ProjectLibrary } from './useProjectLibrary'

const template: ProjectTemplate = {
  id: 'bundled/example', filename: 'Example.lua', source: '-- pristine', modules: { helper: '-- helper' },
}

class ObservedStore extends MemoryProjectStore {
  saves: ProjectSaveRequest[] = []

  override async saveProject(change: ProjectSaveRequest) {
    this.saves.push(change)
    return super.saveProject(change)
  }
}

class FailingSaveStore extends MemoryProjectStore {
  override async saveProject(change: ProjectSaveRequest): Promise<never> {
    void change
    throw new DOMException('quota full', 'QuotaExceededError')
  }
}

let library: ProjectLibrary
let root: ReturnType<typeof createRoot>
let container: HTMLDivElement

function Harness({ store }: { store: MemoryProjectStore }) {
  const value = useProjectLibrary({
    templates: new Map([[template.id, template]]),
    defaultTemplate: template,
    createStore: () => store,
    recoveryStorage: window.localStorage,
    now: () => 100,
    id: (() => {
      let next = 0
      return () => `id-${++next}`
    })(),
    sourceDebounceMs: 20,
    viewDebounceMs: 20,
    broadcastChannel: () => ({
      close() {}, postMessage() {}, onmessage: null,
    } as unknown as BroadcastChannel),
  })
  useEffect(() => { library = value }, [value])
  return null
}

async function mount(store: MemoryProjectStore) {
  container = document.createElement('div')
  root = createRoot(container)
  await act(async () => { root.render(<Harness store={store} />) })
  await act(async () => { await Promise.resolve() })
}

beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers()
})

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  vi.useRealTimers()
})

describe('project-library coordinator', () => {
  it('hydrates before exposing the pristine bundled template', async () => {
    await mount(new MemoryProjectStore())
    expect(library.hydrated).toBe(true)
    expect(library.active).toMatchObject({ key: 'bundled:bundled/example', source: '-- pristine' })
    expect(library.saveStatus).toEqual({ kind: 'template' })
  })

  it('forks a bundled template on its first edit and preserves the modules snapshot', async () => {
    const store = new MemoryProjectStore()
    await mount(store)
    await act(async () => { library.editSource('-- edited'); await Promise.resolve() })
    expect(library.active).toMatchObject({
      key: 'project:id-1', source: '-- edited', modules: { helper: '-- helper' },
    })
    expect(library.projects[0]).toMatchObject({
      origin: { kind: 'bundled', exampleId: 'bundled/example' }, source: '-- edited',
    })
    expect((await store.hydrate()).projects[0].source).toBe('-- edited')
  })

  it('debounces edits and flushes the pending source before a document switch', async () => {
    const store = new ObservedStore()
    await mount(store)
    await act(async () => { await library.createNew() })
    await act(async () => { library.editSource('-- pending') })
    expect(store.saves).toHaveLength(0)
    await act(async () => { await library.selectTemplate(template.id) })
    expect(store.saves).toMatchObject([{ source: '-- pending', expectedRevision: 1 }])
    expect(library.active.key).toBe('bundled:bundled/example')
  })

  it('saves editor view metadata without advancing the source revision', async () => {
    const store = new MemoryProjectStore()
    await mount(store)
    await act(async () => { await library.createNew() })
    await act(async () => {
      library.updateEditorView({ line: 3, column: 2, scrollTop: 10, scrollLeft: 4 })
      await vi.advanceTimersByTimeAsync(20)
    })
    expect((await store.hydrate()).projects[0]).toMatchObject({
      revision: 1,
      editorView: { line: 3, column: 2, scrollTop: 10, scrollLeft: 4 },
    })
  })

  it('recovers a newer synchronous journal into a separate named project', async () => {
    window.localStorage.setItem('luading-active-source-recovery-v1', JSON.stringify({
      version: 1,
      document: { kind: 'project', projectId: 'missing' },
      filename: 'Lost.lua',
      source: '-- recovered source',
      revision: 3,
      updatedAt: 99,
    }))
    const store = new MemoryProjectStore()
    await mount(store)
    expect(library.active).toMatchObject({
      filename: 'Lost recovered.lua', source: '-- recovered source',
    })
    expect(library.projects[0].origin).toEqual({ kind: 'recovery' })
    expect(window.localStorage.getItem('luading-active-source-recovery-v1')).toBeNull()
  })

  it('keeps failed source saves visibly degraded and blocks an implicit switch', async () => {
    await mount(new FailingSaveStore())
    await act(async () => { await library.createNew() })
    await act(async () => {
      library.editSource('-- cannot persist')
      await vi.advanceTimersByTimeAsync(20)
    })
    expect(library.saveStatus).toMatchObject({ kind: 'degraded', recoverable: true })
    expect(window.localStorage.getItem('luading-active-source-recovery-v1')).toContain('-- cannot persist')
    await act(async () => {
      await expect(library.selectTemplate(template.id)).resolves.toBe(false)
    })
    expect(library.active.source).toBe('-- cannot persist')
  })

  it('soft deletes with a deterministic fallback and offers undo', async () => {
    const store = new MemoryProjectStore()
    await mount(store)
    await act(async () => { await library.createNew() })
    const firstId = library.active.ref.kind === 'project' ? library.active.ref.projectId : ''
    await act(async () => { await library.createNew() })
    const deletedId = library.active.ref.kind === 'project' ? library.active.ref.projectId : ''
    await act(async () => { await library.deleteActive() })
    expect(library.active.ref).toEqual({ kind: 'project', projectId: firstId })
    expect(library.deletedProjectId).toBe(deletedId)
    await act(async () => { await library.undoDelete() })
    expect(library.projects.map(({ id }) => id)).toContain(deletedId)
  })
})
