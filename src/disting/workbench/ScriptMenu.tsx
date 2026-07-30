import { useRef, useState } from 'react'
import { ControlIcon } from '../controls'
import { ControlPopover } from '../controls/ControlPopover'
import type { DistingScriptExampleGroup } from '../script-examples'
import { filterScriptGroups } from './script-menu'

interface Props {
  programName: string
  selectedExampleId: string
  scriptGroups: DistingScriptExampleGroup[]
  loading: boolean
  onSelectExample(id: string): void
}

export function ScriptMenu({
  programName,
  selectedExampleId,
  scriptGroups,
  loading,
  onSelectExample,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const filteredGroups = filterScriptGroups(scriptGroups, query)

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
        </span>
        <ControlIcon name="menu" size={12} />
      </button>

      <ControlPopover
        open={open}
        label="Choose Lua script"
        anchorRef={triggerRef}
        onClose={() => setOpen(false)}
      >
        <input
          className="script-menu-search"
          type="search"
          aria-label="Search bundled scripts"
          placeholder="Search bundled scripts…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="script-menu-groups">
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
          {filteredGroups.length === 0 && (
            <p>No bundled scripts match “{query}”.</p>
          )}
        </div>
      </ControlPopover>
    </div>
  )
}
