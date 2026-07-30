import { ControlIcon } from '../controls'
import { Tooltip } from '../controls/Tooltip'
import type { RuntimeStateValue } from './RuntimeStatus'

interface Props {
  status: RuntimeStateValue
  programLoaded: boolean
  canToggleRunning: boolean
  onToggleRunning(): void
  onRun(): void
}

export function RunControls({
  status,
  programLoaded,
  canToggleRunning,
  onToggleRunning,
  onRun,
}: Props) {
  const running = status === 'running'
  const loading = status === 'booting' || status === 'loading'
  const runLabel = programLoaded ? 'Reload Lua script' : 'Run Lua script'
  const transportLabel = running ? 'Pause Lua runtime' : 'Resume Lua runtime'

  return (
    <div
      className="run-controls"
      role="group"
      aria-label="Lua runtime transport"
    >
      <Tooltip content={`${runLabel} · ⌘/Ctrl+Enter`} placement="bottom">
        <button
          type="button"
          className="workbench-command workbench-command--primary"
          aria-label={runLabel}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          disabled={loading}
          onClick={onRun}
        >
          <ControlIcon name={programLoaded ? 'reload' : 'play'} size={14} />
          <span>{programLoaded ? 'Reload' : 'Run'}</span>
        </button>
      </Tooltip>
      <Tooltip
        content={`${transportLabel} · ⌘/Ctrl+Alt+P`}
        placement="bottom"
      >
        <button
          type="button"
          className="workbench-command workbench-command--secondary"
          aria-label={transportLabel}
          aria-keyshortcuts="Control+Alt+P Meta+Alt+P"
          disabled={!canToggleRunning}
          onClick={onToggleRunning}
        >
          <ControlIcon name={running ? 'pause' : 'play'} size={14} />
          <span>{running ? 'Pause' : 'Resume'}</span>
        </button>
      </Tooltip>
    </div>
  )
}
