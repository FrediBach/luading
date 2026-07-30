import { IconToggle, ValueField } from '../controls'
import type { SynthWaveform } from '../emulation/web-audio'
import { SYNTH_WAVEFORMS } from './output-audio-controls'

interface Props {
  enabled: boolean
  level: number
  waveform: SynthWaveform
  error: string | null
  onToggle(): void
  onLevelChange(level: number): void
  onWaveformChange(waveform: SynthWaveform): void
}

export function AudioMasterControl({
  enabled,
  level,
  waveform,
  error,
  onToggle,
  onLevelChange,
  onWaveformChange,
}: Props) {
  const status = error ? 'unavailable' : enabled ? 'enabled' : 'disabled'

  return (
    <div className={`audio-master-control audio-master-control--${status}`}>
      <IconToggle
        icon="speaker"
        label={enabled ? 'Disable WebAudio monitoring' : 'Enable WebAudio monitoring'}
        pressed={enabled}
        showLabel
        onChange={onToggle}
      />
      <ValueField
        label="WebAudio master level"
        value={Math.round(level * 100)}
        min={0}
        max={100}
        step={1}
        unit="%"
        onChange={(percent) => onLevelChange(percent / 100)}
      />
      <label className="audio-waveform-select">
        <span>Synth</span>
        <select
          aria-label="WebAudio synth waveform"
          value={waveform}
          onChange={(event) => onWaveformChange(
            event.target.value as SynthWaveform,
          )}
        >
          {SYNTH_WAVEFORMS.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <span className="audio-master-status" aria-live="polite">
        {status}
      </span>
      {error && (
        <p className="audio-master-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
