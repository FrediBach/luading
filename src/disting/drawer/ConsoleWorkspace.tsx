import { useEffect, useMemo, useRef, useState } from 'react'
import { ControlIcon } from '../controls/ControlIcon'
import {
  DEFAULT_CONSOLE_FILTERS,
  filterConsoleEntries,
  type ConsoleEntry,
  type ConsoleEntryKind,
} from './drawer-workspaces'

interface Props {
  entries: ConsoleEntry[]
  onClear(): void
}

const FILTERS: Array<{ kind: ConsoleEntryKind; label: string }> = [
  { kind: 'error', label: 'Errors' },
  { kind: 'lua', label: 'Lua' },
  { kind: 'midi', label: 'MIDI' },
  { kind: 'i2c', label: 'I2C' },
  { kind: 'display', label: 'Display' },
]

function consoleEntryLabel(entry: ConsoleEntry) {
  return `${entry.kind.toUpperCase().padEnd(7)} ${entry.message}`
}

export function ConsoleWorkspace({ entries, onClear }: Props) {
  const [filters, setFilters] = useState(DEFAULT_CONSOLE_FILTERS)
  const [autoscroll, setAutoscroll] = useState(true)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const listRef = useRef<HTMLDivElement>(null)
  const visibleEntries = useMemo(
    () => filterConsoleEntries(entries, filters),
    [entries, filters],
  )

  useEffect(() => {
    if (!autoscroll || !listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [autoscroll, visibleEntries])

  const copyVisible = async () => {
    try {
      await navigator.clipboard.writeText(
        visibleEntries.map(consoleEntryLabel).join('\n'),
      )
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <section className="console-workspace" aria-label="Console workspace">
      <div className="console-toolbar">
        <div className="console-filter-group" aria-label="Console filters">
          {FILTERS.map((filter) => (
            <button
              type="button"
              aria-pressed={filters[filter.kind]}
              className={filters[filter.kind] ? 'is-active' : ''}
              onClick={() => setFilters((current) => ({
                ...current,
                [filter.kind]: !current[filter.kind],
              }))}
              key={filter.kind}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <span className="console-entry-count">
          {visibleEntries.length} / {entries.length} visible
        </span>

        <button
          type="button"
          className={`console-tool${autoscroll ? ' is-active' : ''}`}
          aria-pressed={autoscroll}
          onClick={() => setAutoscroll((current) => !current)}
          title="Pause or resume console autoscroll"
        >
          <ControlIcon name={autoscroll ? 'play' : 'pause'} size={12} />
          Autoscroll
        </button>
        <button
          type="button"
          className="console-tool"
          onClick={() => void copyVisible()}
          disabled={visibleEntries.length === 0}
          title="Copy visible console entries"
        >
          <ControlIcon name="code" size={12} />
          {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy'}
        </button>
        <button
          type="button"
          className="console-tool"
          onClick={onClear}
          disabled={entries.length === 0}
          title="Clear the console view"
        >
          <ControlIcon name="reset" size={12} />
          Clear view
        </button>
      </div>

      <div
        className="console-list"
        ref={listRef}
        role="log"
        aria-live={autoscroll ? 'polite' : 'off'}
      >
        {visibleEntries.length > 0 ? visibleEntries.map((entry) => (
          <div
            className={`console-entry console-entry--${entry.kind}`}
            key={entry.id}
          >
            <span>{entry.kind}</span>
            <code>{entry.message}</code>
          </div>
        )) : (
          <div className="console-empty">
            {entries.length > 0
              ? 'No entries match the active filters.'
              : 'No runtime or hardware events.'}
          </div>
        )}
      </div>
    </section>
  )
}
