// @vitest-environment jsdom
import { act, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryProjectStore } from './project-store'
import { useProjectLibrary, type ProjectLibrary } from './useProjectLibrary'
import { useLocalDirectory, type LocalDirectoryControls } from './useLocalDirectory'
import type { LocalDirectoryHandle, LocalFileHandle } from './local-directory'

let library: ProjectLibrary
let directory: LocalDirectoryControls
let root: ReturnType<typeof createRoot>
let disk: string
let permission: PermissionState
let entries: LocalFileHandle[]
let writes: string[]
let picker: ReturnType<typeof vi.fn>
let frame: () => void
const template = { id: 'example', filename: 'Example.lua', source: '-- template', modules: {} }
function Harness({ store }: { store: MemoryProjectStore }) {
  const [, setFrame] = useState(0)
  useEffect(() => { frame = () => setFrame((value) => value + 1) }, [])
  const projects = useProjectLibrary({ templates: new Map([[template.id, template]]), defaultTemplate: template, createStore: () => store })
  const local = useLocalDirectory(projects)
  useEffect(() => { library = projects; directory = local }, [projects, local])
  return null
}
beforeEach(async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  disk = '-- disk'; permission = 'granted'; writes = []
  entries = [{ kind: 'file', name: 'test.lua', getFile: async () => ({ text: async () => disk }), createWritable: async () => {
    let pending = ''
    return { write: async (source) => { pending = source }, close: async () => { disk = pending; writes.push(pending) }, abort: async () => undefined }
  } }]
  const handle: LocalDirectoryHandle = { name: 'Scripts', async *values() { yield* entries }, requestPermission: async () => permission }
  picker = vi.fn(async () => handle)
  Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: picker })
  root = createRoot(document.createElement('div'))
  await act(async () => root.render(<Harness store={new MemoryProjectStore()} />))
})
afterEach(async () => {
  await act(async () => root.unmount())
  delete (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker
  vi.useRealTimers()
})
async function connectAndOpen() {
  await act(async () => directory.connect())
  await act(async () => directory.open('test.lua'))
}
async function advance(ms = 850) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

describe('directory coordination', () => {
  it('connects read-only, imports a protected browser draft, and writes only after opting in', async () => {
    await connectAndOpen()
    expect(picker).toHaveBeenCalledWith({ mode: 'read' })
    expect(directory.files).toEqual(['test.lua'])
    expect(library.active.source).toBe('-- disk')
    await act(async () => library.editSource('-- changed'))
    await advance()
    expect(writes).toEqual([])
    await act(async () => directory.toggleAutosave())
    expect(writes).toEqual(['-- changed'])
    expect(directory.autosave).toBe(true)
    await act(async () => library.editSource('-- latest'))
    await advance()
    expect(disk).toBe('-- latest')
    await act(async () => directory.toggleAutosave())
    await act(async () => library.editSource('-- browser only'))
    await advance()
    expect(disk).toBe('-- latest')
  })
  it('normalizes a UTF-8 BOM for Lua while retaining raw disk content for conflict checks', async () => {
    disk = '\uFEFF-- disk'
    await connectAndOpen()
    expect(library.active.source).toBe('-- disk')
    await act(async () => directory.save())
    expect(disk).toBe('-- disk')
    expect(directory.error).toBe(false)
  })

  it('does not postpone autosave indefinitely when runtime frames rerender the workbench', async () => {
    await connectAndOpen()
    await act(async () => directory.toggleAutosave())
    await act(async () => { library.editSource('-- running'); await library.flush() })
    for (let index = 0; index < 12; index += 1) {
      await advance(100)
      await act(async () => frame())
    }
    expect(disk).toBe('-- running')
  })

  it('preserves pending file edits when switching to a bundled script', async () => {
    await connectAndOpen()
    await act(async () => directory.toggleAutosave())
    await act(async () => { library.editSource('-- pending'); await library.selectTemplate('example') })
    await advance()
    expect(disk).toBe('-- pending')
    expect(directory.activeFile).toBeUndefined()
    expect(directory.autosave).toBe(false)
  })
  it('stops autosave on external edits and reopens disk as a separate preserved draft', async () => {
    await connectAndOpen()
    await act(async () => directory.toggleAutosave())
    const oldId = library.active.key
    disk = '-- external'
    await act(async () => library.editSource('-- mine'))
    await advance()
    expect(disk).toBe('-- external')
    expect(directory.autosave).toBe(false)
    expect(directory.message).toContain('changed on disk')
    await act(async () => directory.open('test.lua'))
    expect(library.active.source).toBe('-- external')
    expect(library.active.key).not.toBe(oldId)
    expect(library.projects.some((project) => project.source === '-- mine')).toBe(true)
  })
  it('handles denied writes, cancelled picker, refresh, and disconnect without deleting drafts', async () => {
    picker.mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'))
    await act(async () => directory.connect())
    expect(directory.name).toBeUndefined()
    expect(directory.message).toBe('')
    await connectAndOpen()
    permission = 'denied'
    await act(async () => directory.toggleAutosave())
    expect(directory.message).toContain('Write permission was not granted')
    expect(directory.autosave).toBe(false)
    entries = []
    await advance(3100)
    expect(directory.files).toEqual([])
    await act(async () => directory.disconnect())
    expect(directory.name).toBeUndefined()
    expect(directory.activeFile).toBeUndefined()
    expect(library.active.source).toBe('-- disk')
  })
  it('reuses the linked draft when disk has not changed and saves manually', async () => {
    await connectAndOpen()
    const id = library.active.key
    await act(async () => library.editSource('-- draft'))
    await act(async () => library.selectTemplate('example'))
    await act(async () => directory.open('test.lua'))
    expect(library.active.key).toBe(id)
    expect(library.active.source).toBe('-- draft')
    await act(async () => directory.save())
    expect(disk).toBe('-- draft')
    expect(directory.autosave).toBe(false)
  })
})
