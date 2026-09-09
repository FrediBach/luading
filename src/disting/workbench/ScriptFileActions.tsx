import { useRef, useState, type ChangeEvent } from 'react'
import { ControlIcon } from '../controls'
import { ControlPopover } from '../controls/ControlPopover'
import type { LocalDirectoryControls } from './useLocalDirectory'
import { NewScriptDialog } from './NewScriptDialog'
import type { ScriptProject } from './projects'
import type { ScriptScaffoldDraft } from './script-scaffold'

interface Props {
  directory?: LocalDirectoryControls
  projects: ScriptProject[]
  onCreate(draft: ScriptScaffoldDraft): Promise<boolean>
  onImport(file: File): void
  onExport(): void
}

export function ScriptFileActions({ projects, directory, onCreate, onImport, onExport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const fileButtonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [newDialogOpen, setNewDialogOpen] = useState(false)

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) onImport(file)
  }

  return (
    <div className="script-file-actions" role="group" aria-label="Lua script files">
      <input
        ref={inputRef}
        className="script-file-input"
        type="file"
        accept=".lua,text/x-lua,application/x-lua"
        aria-label="Choose Lua script file to import"
        tabIndex={-1}
        onChange={selectFile}
      />
      <button ref={fileButtonRef} type="button" className="commandbar-icon-command"
        title={directory?.message || "Script files"} aria-label="Script files" aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen((value) => !value)}>
        <ControlIcon name={directory?.error ? "warning" : "code"} size={14} /><span>File</span><ControlIcon name="menu" size={12} />
      </button>
      <ControlPopover open={open} label="Script files" anchorRef={fileButtonRef}
        preferredWidth={310} onClose={() => setOpen(false)}>
        <div className="script-file-menu">
          <button type="button" aria-label="Create new Lua script" onClick={() => { setOpen(false); setNewDialogOpen(true) }}>
            <ControlIcon name="new" size={14} /> New
          </button>
          <button type="button" aria-label="Import Lua script" onClick={() => { inputRef.current?.click(); setOpen(false) }}>
            <ControlIcon name="import" size={14} /> Import
          </button>
          <button type="button" aria-label="Export Lua script" onClick={() => { onExport(); setOpen(false) }}>
            <ControlIcon name="export" size={14} /> Export
          </button>
          <section className="script-directory-actions" aria-label="Local directory">
            <h3>Local directory</h3>
            {directory?.name ? <>
              <p className="script-directory-name">{directory.name}</p>
              <div className="script-action-row">
                <button type="button" disabled={directory.busy} onClick={directory.refresh}>Refresh</button>
                <button type="button" disabled={directory.busy} onClick={directory.disconnect}>Disconnect</button>
              </div>
              <button type="button" disabled={directory.busy || !directory.activeFile} onClick={directory.save}>Save current file to directory</button>
              <label><input type="checkbox" checked={directory.autosave}
                disabled={directory.busy || !directory.activeFile} onChange={directory.toggleAutosave} /> Autosave current file</label>
              <p>{directory.activeFile ? `Linked file: ${directory.activeFile}` : 'Choose a file from the directory in the scripts dropdown to save or enable autosave.'}</p>
            </> : <>
              <button type="button" disabled={!directory?.supported || directory.busy} onClick={directory?.connect}>Connect local directory…</button>
              {!directory?.supported && <p>Directory access requires a browser with the File System Access API, such as desktop Chrome or Edge, on HTTPS or localhost. Import and Export remain available.</p>}
            </>}
            {directory?.message && <p role="status">{directory.message}</p>}
            <p>Browser-only feature · Lua files in this directory appear in the scripts dropdown. Reconnect after reloading the page.</p>
          </section>
        </div>
      </ControlPopover>
      {directory?.message && <span className="visually-hidden" role="status">{directory.message}</span>}
      <NewScriptDialog
        open={newDialogOpen}
        projects={projects}
        returnFocusRef={fileButtonRef}
        onClose={() => setNewDialogOpen(false)}
        onCreate={onCreate}
      />
    </div>
  )
}
