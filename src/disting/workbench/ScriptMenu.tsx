import { useRef, useState } from 'react'
import { ControlIcon } from '../controls'
import { ControlPopover } from '../controls/ControlPopover'
import type { DistingScriptExampleGroup } from '../script-examples'
import type { ScriptProject, SourceSaveStatus } from './projects'
import type { StorageDurability } from './storage-durability'
import { filterScriptGroups, filterScriptProjects } from './script-menu'
import { sourceSaveLabel } from './source-save-status'

interface Props {
  programName: string
  selectedExampleId: string
  activeProjectId?: string
  projects: ScriptProject[]
  scriptGroups: DistingScriptExampleGroup[]
  saveStatus: SourceSaveStatus
  notice?: string
  deletedProjectId?: string
  durability: StorageDurability
  loading: boolean
  onSelectExample(id: string): void
  onSelectProject(id: string): void
  onRename(filename: string): void
  onDuplicate(): void
  onDelete(): void
  onUndoDelete(): void
  onBackup(): void
  onRestore(file: File): void
  onProtectDrafts(): void
}

export function ScriptMenu({
  programName,
  selectedExampleId,
  activeProjectId,
  projects,
  scriptGroups,
  saveStatus,
  notice,
  deletedProjectId,
  durability,
  loading,
  onSelectExample,
  onSelectProject,
  onRename,
  onDuplicate,
  onDelete,
  onUndoDelete,
  onBackup,
  onRestore,
  onProtectDrafts,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const restoreInputRef = useRef<HTMLInputElement>(null)
  const filteredGroups = filterScriptGroups(scriptGroups, query)
  const filteredProjects = filterScriptProjects(projects, query)
  const saveLabel = sourceSaveLabel(saveStatus)

  return (
    <div className="commandbar-popover-shell script-menu">
      <button
        ref={triggerRef}
        type="button"
        className="script-menu-trigger"
        aria-label={`Choose Lua script. Current script: ${programName}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-busy={loading}
        onClick={() => setOpen((value) => !value)}
      >
        <ControlIcon name="code" size={14} />
        <span>
          <small>{loading ? 'Loading script' : 'Script'}</small>
          <strong>{programName}</strong>
          <small className={`script-save-status script-save-status--${saveStatus.kind}`}>{saveLabel}</small>
        </span>
        <ControlIcon name="menu" size={12} />
      </button>

      <ControlPopover
        open={open}
        label="Choose Lua script"
        anchorRef={triggerRef}
        preferredWidth={390}
        onClose={() => setOpen(false)}
      >
        <input
          className="script-menu-search"
          type="search"
          aria-label="Search scripts"
          placeholder="Search scripts…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="script-menu-groups">
          <section aria-label="My Scripts">
            <h3>My Scripts</h3>
            {filteredProjects.map((project) => (
              <button
                type="button"
                className={project.id === activeProjectId ? 'is-active' : ''}
                aria-current={project.id === activeProjectId ? 'true' : undefined}
                onClick={() => {
                  onSelectProject(project.id)
                  setOpen(false)
                  setQuery('')
                }}
                key={project.id}
              >
                <span>{project.filename}</span>
                {project.id === activeProjectId && <small>Open</small>}
              </button>
            ))}
            {projects.length === 0 && !query && (
              <p>New, Import, or editing a bundled example creates a local script.</p>
            )}
            {projects.length > 0 && filteredProjects.length === 0 && (
              <p>No local scripts match “{query}”.</p>
            )}
          </section>
          {filteredGroups.map((group) => (
            <section aria-label={group.name} key={group.name}>
              <h3>{group.name}</h3>
              {group.examples.map((example) => (
                <button
                  type="button"
                  className={example.id === selectedExampleId ? 'is-active' : ''}
                  aria-current={example.id === selectedExampleId ? 'true' : undefined}
                  onClick={() => {
                    onSelectExample(example.id)
                    setOpen(false)
                    setQuery('')
                  }}
                  key={example.id}
                >
                  <span>{example.name}</span>
                  {example.id === selectedExampleId && <small>Loaded</small>}
                </button>
              ))}
            </section>
          ))}
          {filteredGroups.length === 0 && filteredProjects.length === 0 && query && (
            <p>No scripts match “{query}”.</p>
          )}
        </div>

        {activeProjectId && (
          <section className="script-project-actions" aria-label="Active script actions">
            <h3>Active local script</h3>
            <div className="script-rename-row">
              <input
                type="text"
                aria-label="Rename local script"
                placeholder="New filename.lua"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
              />
              <button
                type="button"
                disabled={!renameValue.trim()}
                onClick={() => {
                  onRename(renameValue)
                  setRenameValue('')
                }}
              >Rename</button>
            </div>
            <div className="script-action-row">
              <button type="button" onClick={onDuplicate}>Duplicate</button>
              <button type="button" className="is-danger" onClick={onDelete}>Delete</button>
            </div>
          </section>
        )}

        {deletedProjectId && (
          <button type="button" className="script-undo-delete" onClick={onUndoDelete}>
            Undo deleted script
          </button>
        )}

        <section className="script-storage-actions" aria-label="Local script storage and backup">
          <h3>Local storage</h3>
          <p className="script-storage-message" aria-live="polite">
            {saveStatus.kind === 'template'
              ? 'Bundled templates stay pristine. The first edit creates a local copy.'
              : saveStatus.kind === 'saved'
                ? 'Source is saved locally in this browser profile and origin.'
                : saveStatus.kind === 'saving'
                  ? 'Saving the latest source locally…'
                  : saveStatus.kind === 'conflict'
                    ? 'A stale edit was preserved as a separate conflict copy.'
                    : saveStatus.message}
          </p>
          {notice && <p className="script-storage-notice" role="status">{notice}</p>}
          <p>
            {durability.persisted
              ? 'Protected storage is granted. Clearing site data can still remove scripts.'
              : 'Local drafts may be removed under storage pressure. Backups are recommended.'}
          </p>
          {durability.usage !== undefined && durability.quota !== undefined && (
            <p>Approximate site storage: {Math.round(durability.usage / 1024)} KB of {Math.round(durability.quota / 1024)} KB.</p>
          )}
          <div className="script-action-row">
            {!durability.persisted && durability.supported && (
              <button type="button" onClick={onProtectDrafts}>Protect local drafts</button>
            )}
            <button type="button" onClick={onBackup}>Back up all scripts</button>
            <button type="button" onClick={() => restoreInputRef.current?.click()}>Restore backup</button>
          </div>
          <input
            ref={restoreInputRef}
            className="script-file-input"
            type="file"
            accept=".luading-backup.json,application/json"
            aria-label="Restore Luading backup file"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onRestore(file)
              event.target.value = ''
            }}
          />
          <p>Projects are local to this origin and browser profile. They do not sync, survive all private sessions, or replace a backup.</p>
        </section>
      </ControlPopover>
    </div>
  )
}
