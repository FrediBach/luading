import { IconToggle, RotaryControl } from '../controls'
import type { GlobalClockConfig } from '../types'

interface Props {
  clock: GlobalClockConfig
  onChange(clock: GlobalClockConfig): void
}

export function ClockTransport({ clock, onChange }: Props) {
  return (
    <div
      className="clock-transport"
      role="group"
      aria-label="Global test-signal clock transport"
    >
      <IconToggle
        icon="clock"
        label={`${clock.running ? 'Stop' : 'Start'} global test-signal clock`}
        pressed={clock.running}
        onChange={(running) => onChange({ ...clock, running })}
      />
      <span className="clock-transport-label" aria-hidden="true">
        <small>Signal clock</small>
        <strong>{clock.running ? 'Running' : 'Stopped'}</strong>
      </span>
      <div className="clock-tempo-control">
        <RotaryControl
          label="Global test-signal clock tempo"
          value={clock.bpm}
          min={1}
          max={999}
          step={1}
          defaultValue={120}
          unit="BPM"
          size="small"
          onChange={(bpm) => onChange({ ...clock, bpm })}
        />
      </div>
    </div>
  )
}
