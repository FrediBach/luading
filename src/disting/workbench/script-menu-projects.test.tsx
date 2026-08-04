// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScriptMenu } from './ScriptMenu'
import { createScriptProject } from './projects'
import { sourceSaveLabel } from './source-save-status'

const project = createScriptProject({
  id: 'mine', filename: 'My Patch.lua', source: '-- mine', modules: {}, origin: { kind: 'new' }, now: 1,
})

let root: ReturnType<typeof createRoot> | undefined

afterEach(async () => {
  if (root) await act(async () => { root?.unmount() })
  root = undefined
  document.body.replaceChildren()
})

describe('My Scripts menu', () => {
  it('exposes local project actions, saved status, backup, restore, and durability guidance', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root?.render(
        <ScriptMenu
          programName="My Patch.lua"
          selectedExampleId=""
          activeProjectId="mine"
          projects={[project]}
          scriptGroups={[]}
          saveStatus={{ kind: 'saved', savedAt: 2 }}
          durability={{ supported: true, persisted: false, usage: 1024, quota: 4096 }}
          loading={false}
          onSelectExample={vi.fn()}
          onSelectProject={vi.fn()}
          onRename={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
          onUndoDelete={vi.fn()}
          onBackup={vi.fn()}
          onRestore={vi.fn()}
          onProtectDrafts={vi.fn()}
        />,
      )
    })
    expect(host.textContent).toContain('Saved locally')
    const trigger = host.querySelector('button')
    await act(async () => { trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(document.body.textContent).toContain('My Scripts')
    expect(document.body.textContent).toContain('My Patch.luaOpen')
    expect(document.body.innerHTML).toContain('aria-current="true"')
    expect(document.body.innerHTML).toContain('aria-label="Rename local script"')
    expect(document.body.textContent).toContain('Duplicate')
    expect(document.body.textContent).toContain('Delete')
    expect(document.body.textContent).toContain('Protect local drafts')
    expect(document.body.textContent).toContain('Back up all scripts')
    expect(document.body.textContent).toContain('Restore backup')
    expect(document.body.innerHTML).toContain('accept=".luading-backup.json,application/json"')
    expect(document.body.textContent).toContain('do not sync')
  })

  it('explains how an empty local library is populated', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root?.render(
        <ScriptMenu
          programName="Example.lua"
          selectedExampleId="example"
          projects={[]}
          scriptGroups={[]}
          saveStatus={{ kind: 'template' }}
          durability={{ supported: false, persisted: null }}
          loading={false}
          onSelectExample={vi.fn()}
          onSelectProject={vi.fn()}
          onRename={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
          onUndoDelete={vi.fn()}
          onBackup={vi.fn()}
          onRestore={vi.fn()}
          onProtectDrafts={vi.fn()}
        />,
      )
    })
    await act(async () => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(document.body.textContent).toContain('New, Import, or editing a bundled example creates a local script.')
    expect(document.body.textContent).toContain('Bundled templates stay pristine')
  })

  it('uses unambiguous source-persistence labels', () => {
    expect(sourceSaveLabel({ kind: 'saving' })).toBe('Saving source…')
    expect(sourceSaveLabel({ kind: 'degraded', recoverable: true, message: 'offline' })).toBe('Recovery draft')
    expect(sourceSaveLabel({ kind: 'unsaved', message: 'failed' })).toBe('Source not saved')
  })
})
