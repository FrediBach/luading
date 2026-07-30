import {
  IconToggle,
  SegmentedSelector,
  ValueField,
} from '../controls'
import type { TriggerEdge } from '../emulation/scope-model'
import type { LoadedProgram, ScopeProbe } from '../types'
import { scopeSourceLabel } from './scope-controls'

interface Props {
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
  onSyncChange(enabled: boolean): void
  onTriggerProbeChange(probe: 'auto' | number): void
  onTriggerEdgeChange(edge: TriggerEdge): void
  onTriggerLevelChange(level: number): void
  onTimeZoomChange(index: number): void
  onVoltageZoomChange(index: number): void
}

export function ScopeToolbar({
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
  onSyncChange,
  onTriggerProbeChange,
  onTriggerEdgeChange,
  onTriggerLevelChange,
  onTimeZoomChange,
  onVoltageZoomChange,
}: Props) {
  return (
    <div className="scope-toolbar" aria-label="Oscilloscope controls">
      <IconToggle
        icon="sync"
        label="Scope synchronization"
        pressed={syncEnabled}
        showLabel
        onChange={onSyncChange}
      />

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
