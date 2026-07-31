import type { DistingScriptExampleGroup } from '../script-examples'
import type { ThemeMode } from '../theme'
import type { GlobalClockConfig } from '../types'
import { SaveStateControl } from '../device/SaveStateControl'
import { AboutPopover } from './AboutPopover'
import { ClockTransport } from './ClockTransport'
import { HealthBadge } from './HealthBadge'
import { MidiEventTool } from './MidiEventTool'
import { RunControls } from './RunControls'
import { RuntimeStatus, type RuntimeStateValue } from './RuntimeStatus'
import { ScriptMenu } from './ScriptMenu'
import { ThemeToggle } from './ThemeToggle'
import { WorkspacePresetMenu } from './WorkspacePresetMenu'
import type { WorkspacePresetId } from './workbench-layout'

interface Props {
  programName: string
  selectedExampleId: string
  scriptGroups: DistingScriptExampleGroup[]
  status: RuntimeStateValue
  simulatedSeconds: number
  clock: GlobalClockConfig
  savedState: boolean
  programLoaded: boolean
  workspacePreset: WorkspacePresetId | null
  midi?: {
    bytes: number[]
    messages: string[]
  }
  qualityLabel: string
  qualityStatus: 'pending' | 'invalid' | 'provisional' | 'scored'
  qualityErrorCount: number
  qualityWarningCount: number
  canToggleRunning: boolean
  theme: ThemeMode
  onSelectExample(id: string): void
  onToggleRunning(): void
  onRun(): void
  onClockChange(clock: GlobalClockConfig): void
  onSaveState(): void
  onApplyWorkspacePreset(preset: WorkspacePresetId): void
  onMidiBytesChange(bytes: number[]): void
  onSendMidi(bytes: number[]): void
  onOpenProblems(): void
  onToggleTheme(): void
}

export function CommandBar({
  programName,
  selectedExampleId,
  scriptGroups,
  status,
  simulatedSeconds,
  clock,
  savedState,
  programLoaded,
  workspacePreset,
  midi,
  qualityLabel,
  qualityStatus,
  qualityErrorCount,
  qualityWarningCount,
  canToggleRunning,
  theme,
  onSelectExample,
  onToggleRunning,
  onRun,
  onClockChange,
  onSaveState,
  onApplyWorkspacePreset,
  onMidiBytesChange,
  onSendMidi,
  onOpenProblems,
  onToggleTheme,
}: Props) {
  return (
    <header className="workbench-commandbar">
      <div className="workbench-commandbar-brand" aria-label="Luading Disting NT Lua Simulator">
        <span>NT</span>
        <strong>Luading</strong>
      </div>

      <ScriptMenu
        programName={programName}
        selectedExampleId={selectedExampleId}
        scriptGroups={scriptGroups}
        loading={status === 'booting' || status === 'loading'}
        onSelectExample={onSelectExample}
      />

      <RunControls
        status={status}
        programLoaded={programLoaded}
        canToggleRunning={canToggleRunning}
        onToggleRunning={onToggleRunning}
        onRun={onRun}
      />

      <span className="commandbar-divider" aria-hidden="true" />

      <ClockTransport clock={clock} onChange={onClockChange} />

      <div className="workbench-commandbar-spacer" />

      <SaveStateControl
        saved={savedState}
        disabled={!programLoaded}
        onSave={onSaveState}
      />

      <HealthBadge
        label={qualityLabel}
        status={qualityStatus}
        errorCount={qualityErrorCount}
        warningCount={qualityWarningCount}
        onOpen={onOpenProblems}
      />

      <RuntimeStatus status={status} simulatedSeconds={simulatedSeconds} />
      <WorkspacePresetMenu
        activePreset={workspacePreset}
        onApply={onApplyWorkspacePreset}
      />
      {midi && (
        <MidiEventTool
          bytes={midi.bytes}
          messages={midi.messages}
          onBytesChange={onMidiBytesChange}
          onSend={onSendMidi}
        />
      )}
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      <AboutPopover />
    </header>
  )
}
