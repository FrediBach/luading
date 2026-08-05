import { useRef, useState, type ChangeEvent } from 'react'
import { ControlIcon } from '../controls'
import { Tooltip } from '../controls/Tooltip'
import { NewScriptDialog } from './NewScriptDialog'
import type { ScriptProject } from './projects'
import type { ScriptScaffoldDraft } from './script-scaffold'

interface Props {
  projects: ScriptProject[]
  onCreate(draft: ScriptScaffoldDraft): Promise<boolean>
  onImport(file: File): void
  onExport(): void
}

export function ScriptFileActions({ projects, onCreate, onImport, onExport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const newButtonRef = useRef<HTMLButtonElement>(null)
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
      <Tooltip content="Create new Lua script" placement="bottom">
        <button
          ref={newButtonRef}
          type="button"
          className="commandbar-icon-command"
          aria-label="Create new Lua script"
          aria-haspopup="dialog"
          aria-expanded={newDialogOpen}
          onClick={() => setNewDialogOpen(true)}
        >
          <ControlIcon name="new" size={14} />
          <span>New</span>
        </button>
      </Tooltip>
      <NewScriptDialog
        open={newDialogOpen}
        projects={projects}
        returnFocusRef={newButtonRef}
        onClose={() => setNewDialogOpen(false)}
        onCreate={onCreate}
      />
      <Tooltip content="Import Lua script" placement="bottom">
        <button
          type="button"
          className="commandbar-icon-command"
          aria-label="Import Lua script"
          onClick={() => inputRef.current?.click()}
        >
          <ControlIcon name="import" size={14} />
          <span>Import</span>
        </button>
      </Tooltip>
      <Tooltip content="Export Lua script" placement="bottom">
        <button
          type="button"
          className="commandbar-icon-command"
          aria-label="Export Lua script"
          onClick={onExport}
        >
          <ControlIcon name="export" size={14} />
          <span>Export</span>
        </button>
      </Tooltip>
    </div>
  )
}
