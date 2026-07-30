import type { DistingScriptExampleGroup } from '../script-examples'

interface Props {
  programName: string
  selectedExampleId: string
  scriptGroups: DistingScriptExampleGroup[]
  status: 'booting' | 'loading' | 'paused' | 'running' | 'error'
  qualityLabel: string
  qualityStatus: 'pending' | 'invalid' | 'provisional' | 'scored'
  canToggleRunning: boolean
  onSelectExample(id: string): void
  onToggleRunning(): void
  onRun(): void
  onOpenProblems(): void
}

export function CommandBar({
  programName,
  selectedExampleId,
  scriptGroups,
  status,
  qualityLabel,
  qualityStatus,
  canToggleRunning,
  onSelectExample,
  onToggleRunning,
  onRun,
  onOpenProblems,
}: Props) {
  return (
    <header className="workbench-commandbar">
      <div className="workbench-commandbar-brand" aria-label="Luading Disting NT Lua Simulator">
        <span>NT</span>
        <strong>Luading</strong>
      </div>

      <label className="workbench-script-picker">
        <span>Script</span>
        <select
          aria-label="Lua example script"
          value={selectedExampleId}
          onChange={(event) => onSelectExample(event.target.value)}
        >
          <option value="">{programName}</option>
          {scriptGroups.map((group) => (
            <optgroup key={group.name} label={group.name}>
              {group.examples.map((example) => (
                <option key={example.id} value={example.id}>{example.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div className="workbench-commandbar-spacer" />

      <button
        type="button"
        className={`workbench-health workbench-health--${qualityStatus}`}
        onClick={onOpenProblems}
      >
        {qualityLabel}
      </button>

      <button
        type="button"
        className="workbench-command workbench-command--secondary"
        onClick={onToggleRunning}
        disabled={!canToggleRunning}
      >
        {status === 'running' ? 'Pause' : 'Resume'}
      </button>
      <button
        type="button"
        className="workbench-command workbench-command--primary"
        onClick={onRun}
      >
        Run
      </button>

      <div className={`workbench-runtime-state workbench-runtime-state--${status}`}>
        <i />
        <span>{status}</span>
      </div>
    </header>
  )
}
