import {
  IconToggle,
  RotaryControl,
  SegmentedSelector,
  SignalShapeGlyph,
  ValueField,
} from '../controls'
import {
  CLOCK_DIVISIONS,
  SIGNAL_SHAPES,
} from '../emulation/signal-sources'
import type { SignalSourceConfig } from '../types'
import {
  inputShapeDefaults,
  inputUsesPulseWidth,
  inputUsesStepCount,
  inputUsesTiming,
  inputWithSync,
} from './input-source-controls'

interface Props {
  source: SignalSourceConfig
  onChange(source: SignalSourceConfig): void
}

export function InputChannelInspector({ source, onChange }: Props) {
  const patch = (update: Partial<SignalSourceConfig>) => {
    onChange({ ...source, ...update })
  }

  return (
    <div className="input-channel-inspector">
      <fieldset className="input-shape-picker">
        <legend>Signal generator</legend>
        <div>
          {SIGNAL_SHAPES.map((shape) => (
            <button
              type="button"
              className={source.shape === shape.value ? 'is-active' : ''}
              aria-pressed={source.shape === shape.value}
              onClick={() => onChange(inputShapeDefaults(source, shape.value))}
              key={shape.value}
            >
              <SignalShapeGlyph shape={shape.value} size={22} />
              <span>{shape.label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {inputUsesTiming(source) && (
        <div className="input-inspector-section input-inspector-timing">
          <IconToggle
            icon="sync"
            label="Clock sync"
            pressed={source.timing.mode === 'clock'}
            showLabel
            onChange={(synced) => onChange(inputWithSync(source, synced))}
          />
          {source.timing.mode === 'clock' ? (
            <SegmentedSelector
              label="Clock division"
              value={source.timing.division}
              options={CLOCK_DIVISIONS.map((division) => ({
                value: division,
                label: division,
              }))}
              onChange={(division) => patch({
                timing: {
                  mode: 'clock',
                  division: division as typeof source.timing.division,
                },
              })}
            />
          ) : (
            <RotaryControl
              label="Rate"
              value={source.timing.frequencyHz}
              min={0.001}
              max={100}
              step={0.001}
              defaultValue={1}
              unit="Hz"
              size="small"
              formatValue={(value) => value < 1 ? value.toFixed(3) : value.toFixed(2)}
              onChange={(frequencyHz) => patch({
                timing: { mode: 'free', frequencyHz },
              })}
            />
          )}
        </div>
      )}

      <div className="input-inspector-controls">
        {source.shape === 'manual' ? (
          <RotaryControl
            label="Voltage"
            value={source.manualValue}
            min={-10}
            max={10}
            step={0.01}
            defaultValue={0}
            unit="V"
            bipolar
            onChange={(manualValue) => patch({ manualValue })}
          />
        ) : (
          <>
            <RotaryControl
              label="Amplitude"
              value={source.amplitude}
              min={0}
              max={10}
              step={0.01}
              defaultValue={5}
              unit="V"
              onChange={(amplitude) => patch({ amplitude })}
            />
            <RotaryControl
              label="Offset"
              value={source.offset}
              min={-10}
              max={10}
              step={0.01}
              defaultValue={0}
              unit="V"
              bipolar
              onChange={(offset) => patch({ offset })}
            />
          </>
        )}

        {inputUsesTiming(source) && (
          <RotaryControl
            label="Phase"
            value={source.phase}
            min={0}
            max={1}
            step={0.001}
            defaultValue={0}
            formatValue={(value) => `${Math.round(value * 100)}%`}
            onChange={(phase) => patch({ phase })}
          />
        )}

        {inputUsesPulseWidth(source) && (
          <RotaryControl
            label="Pulse width"
            value={source.pulseWidth}
            min={0.001}
            max={0.99}
            step={0.001}
            defaultValue={0.5}
            formatValue={(value) => `${(value * 100).toFixed(1)}%`}
            onChange={(pulseWidth) => patch({ pulseWidth })}
          />
        )}

        {inputUsesStepCount(source) && (
          <RotaryControl
            label="Steps"
            value={source.stepCount}
            min={1}
            max={32}
            step={1}
            defaultValue={8}
            onChange={(stepCount) => patch({ stepCount })}
          />
        )}
      </div>

      {(source.shape === 'noise' || source.shape === 'sampleHold') && (
        <label className="input-seed-control">
          <span>Deterministic seed</span>
          <ValueField
            label="Deterministic seed"
            value={source.seed}
            min={-2147483648}
            max={2147483647}
            step={1}
            onChange={(seed) => patch({ seed })}
          />
        </label>
      )}
    </div>
  )
}

