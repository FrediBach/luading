import {
  ControlIcon,
  SegmentedSelector,
  Tooltip,
  ValueField,
} from '../controls'
import type { TriggerEdge } from '../emulation/scope-model'
import type { LoadedProgram, ScopeProbe } from '../types'
import { scopeSourceLabel } from './scope-controls'

interface Props {
  paused: boolean
  syncEnabled: boolean
  triggerProbe: 'auto' | number
  triggerEdge: TriggerEdge
  triggerLevel: number
  timeZoomIndex: number
  voltageZoomIndex: number
  timeOptions: readonly number[]
  voltageOptions: readonly number[]
  probes: readonly ScopeProbe[]
  program: LoadedProgram | null
  triggerStatus: string
  triggerLocked: boolean
  onPausedChange(paused: boolean): void
  onSyncChange(enabled: boolean): void
  onTriggerProbeChange(probe: 'auto' | number): void
  onTriggerEdgeChange(edge: TriggerEdge): void
  onTriggerLevelChange(level: number): void
  onTimeZoomChange(index: number): void
  onVoltageZoomChange(index: number): void
}

export function ScopeToolbar({
  paused,
  syncEnabled,
  triggerProbe,
  triggerEdge,
  triggerLevel,
  timeZoomIndex,
  voltageZoomIndex,
  timeOptions,
  voltageOptions,
  probes,
  program,
  triggerStatus,
  triggerLocked,
  onPausedChange,
  onSyncChange,
  onTriggerProbeChange,
  onTriggerEdgeChange,
  onTriggerLevelChange,
  onTimeZoomChange,
  onVoltageZoomChange,
}: Props) {
  return (
    <div className="scope-toolbar" aria-label="Oscilloscope controls">
      <Tooltip content={paused ? 'Resume live oscilloscope' : 'Pause oscilloscope'}>
        <button
          type="button"
          className={`control-icon-toggle${paused ? ' is-active' : ''}`}
          aria-label={paused ? 'Resume oscilloscope' : 'Pause oscilloscope'}
          aria-pressed={paused}
          onClick={() => onPausedChange(!paused)}
        >
          <ControlIcon name={paused ? 'play' : 'pause'} />
          <span>{paused ? 'Resume' : 'Pause'}</span>
        </button>
      </Tooltip>

      <label className="scope-sync-switch">
        <span>Sync</span>
        <input
          type="checkbox"
          role="switch"
          aria-label="Sync"
          checked={syncEnabled}
          onChange={(event) => onSyncChange(event.target.checked)}
        />
        <i aria-hidden="true" />
      </label>

      {syncEnabled && (
        <>
          <label className="scope-toolbar-select">
            <span>Trigger</span>
            <select
              aria-label="Scope trigger source"
              value={triggerProbe}
              onChange={(event) => onTriggerProbeChange(
                event.target.value === 'auto'
                  ? 'auto'
                  : Number(event.target.value),
              )}
            >
              <option value="auto">Auto source + level</option>
              {probes.map((probe, index) => (
                <option value={index} key={probe.id}>
                  CH {index + 1} · {scopeSourceLabel(probe.source, program)}
                </option>
              ))}
            </select>
          </label>
          <SegmentedSelector
            label="Trigger edge"
            value={triggerEdge}
            options={[
              { value: 'rising', label: 'Rising' },
              { value: 'falling', label: 'Falling' },
            ]}
            onChange={(edge) => onTriggerEdgeChange(edge as TriggerEdge)}
          />
          {triggerProbe !== 'auto' && (
            <ValueField
              label="Scope trigger level"
              value={triggerLevel}
              min={-10}
              max={10}
              step={0.1}
              unit="V"
              onChange={onTriggerLevelChange}
            />
          )}
        </>
      )}

      <span
        className={`scope-trigger-status${triggerLocked ? ' is-locked' : ''}`}
        aria-live="polite"
      >
        <i />
        {triggerStatus}
      </span>

      <label className="scope-toolbar-select scope-toolbar-zoom">
        <span>Time</span>
        <select
          aria-label="Horizontal scope scale"
          value={timeZoomIndex}
          onChange={(event) => onTimeZoomChange(Number(event.target.value))}
        >
          {timeOptions.map((milliseconds, index) => (
            <option value={index} key={milliseconds}>
              {milliseconds} ms/div
            </option>
          ))}
        </select>
      </label>

      <label className="scope-toolbar-select scope-toolbar-zoom">
        <span>Voltage</span>
        <select
          aria-label="Vertical scope scale"
          value={voltageZoomIndex}
          onChange={(event) => onVoltageZoomChange(Number(event.target.value))}
        >
          {voltageOptions.map((volts, index) => (
            <option value={index} key={volts}>
              {volts} V/div
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
