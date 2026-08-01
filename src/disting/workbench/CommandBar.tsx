import type { DistingScriptExampleGroup } from '../script-examples'
import type { ThemeMode } from '../theme'
import type {
  DistingMidiDestination,
  DistingMidiPortAssignments,
  GlobalClockConfig,
  WebMidiDeviceState,
} from '../types'
import type { TextSize } from '../appearance'
import { SaveStateControl } from '../device/SaveStateControl'
import { AboutPopover } from './AboutPopover'
import { AppearancePopover } from './AppearancePopover'
import { ClockTransport } from './ClockTransport'
import { HealthBadge } from './HealthBadge'
import { MidiEventTool } from './MidiEventTool'
import { RunControls } from './RunControls'
import { RuntimeStatus, type RuntimeStateValue } from './RuntimeStatus'
import { ScriptFileActions } from './ScriptFileActions'
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
    devices: WebMidiDeviceState
    enabledInputIds: string[]
    assignments: DistingMidiPortAssignments
  }
  qualityLabel: string
  qualityStatus: 'pending' | 'invalid' | 'provisional' | 'scored'
  qualityErrorCount: number
  qualityWarningCount: number
  canToggleRunning: boolean
  theme: ThemeMode
  textSize: TextSize
  onSelectExample(id: string): void
  onNewScript(): void
  onImportScript(file: File): void
  onExportScript(): void
  onToggleRunning(): void
  onRun(): void
  onClockChange(clock: GlobalClockConfig): void
  onSaveState(): void
  onApplyWorkspacePreset(preset: WorkspacePresetId): void
  onMidiBytesChange(bytes: number[]): void
  onSendMidi(bytes: number[]): void
  onConnectMidi(): void
  onToggleMidiInput(portId: string, enabled: boolean): void
  onMidiAssignmentChange(destination: DistingMidiDestination, portId: string): void
  onOpenProblems(): void
  onToggleTheme(): void
  onTextSizeChange(textSize: TextSize): void
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
  textSize,
  onSelectExample,
  onNewScript,
  onImportScript,
  onExportScript,
  onToggleRunning,
  onRun,
  onClockChange,
  onSaveState,
  onApplyWorkspacePreset,
  onMidiBytesChange,
  onSendMidi,
  onConnectMidi,
  onToggleMidiInput,
  onMidiAssignmentChange,
  onOpenProblems,
  onToggleTheme,
  onTextSizeChange,
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

      <ScriptFileActions
        onNew={onNewScript}
        onImport={onImportScript}
        onExport={onExportScript}
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
          devices={midi.devices}
          enabledInputIds={midi.enabledInputIds}
          assignments={midi.assignments}
          onBytesChange={onMidiBytesChange}
          onSend={onSendMidi}
          onConnect={onConnectMidi}
          onToggleInput={onToggleMidiInput}
          onAssignmentChange={onMidiAssignmentChange}
        />
      )}
      <AppearancePopover textSize={textSize} onChange={onTextSizeChange} />
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      <AboutPopover />
    </header>
  )
}
