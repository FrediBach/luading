import {
  IconToggle,
  RotaryControl,
  SegmentedSelector,
  SignalShapeGlyph,
  ValueField,
} from '../controls'
import { formatDisplayFloat } from '../display-format'
import {
  CLOCK_DIVISIONS,
  defaultSignalSource,
  SIGNAL_SHAPES,
} from '../emulation/signal-sources'
import { defaultWebMidiInputMapping } from '../emulation/midi-routing'
import type { SignalSourceConfig } from '../types'
import type {
  InputChannelRoute,
  InputKind,
  WebMidiDeviceState,
} from '../types'
import {
  inputShapeDefaults,
  inputUsesPulseWidth,
  inputUsesStepCount,
  inputUsesTiming,
  inputWithSync,
} from './input-source-controls'
import { WebMidiInputInspector } from './WebMidiInputInspector'
import { FreeformCvEditor } from './FreeformCvEditor'
import { GateStepEditor } from './GateStepEditor'

interface Props {
  kind: InputKind
  route: InputChannelRoute
  devices: WebMidiDeviceState
  onChange(route: InputChannelRoute): void
  onConnectMidi(): void
}

export function InputChannelInspector({
  kind,
  route,
  devices,
  onChange,
  onConnectMidi,
}: Props) {
  const source = route.kind === 'generator' ? route.source : null
  const selectGenerator = () => onChange({
    kind: 'generator',
    source: defaultSignalSource(kind, 0),
  })
  const selectWebMidi = () => onChange({
    kind: 'webMidi',
    mapping: defaultWebMidiInputMapping(
      kind,
      devices.inputs.find((port) => port.state === 'connected')?.id ?? '',
    ),
  })

  return (
    <div className="input-channel-inspector">
      <fieldset className="input-source-picker">
        <legend>Input source</legend>
        <button
          type="button"
          aria-pressed={route.kind === 'generator'}
          onClick={selectGenerator}
        >
          Signal generator
        </button>
        <button
          type="button"
          aria-pressed={route.kind === 'webMidi'}
          onClick={selectWebMidi}
        >
          Web MIDI
        </button>
      </fieldset>

      {route.kind === 'webMidi' ? (
        <WebMidiInputInspector
          inputKind={kind}
          mapping={route.mapping}
          devices={devices}
          onChange={(mapping) => onChange({ kind: 'webMidi', mapping })}
          onConnect={onConnectMidi}
        />
      ) : source ? (
        <SignalGeneratorInspector
          source={source}
          onChange={(nextSource) => onChange({ kind: 'generator', source: nextSource })}
        />
      ) : null}
    </div>
  )
}

function SignalGeneratorInspector({
  source,
  onChange,
}: {
  source: SignalSourceConfig
  onChange(source: SignalSourceConfig): void
}) {
  const patch = (update: Partial<SignalSourceConfig>) => {
    onChange({ ...source, ...update })
  }

  return (
    <div className="signal-generator-inspector">
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
              formatValue={formatDisplayFloat}
              onChange={(frequencyHz) => patch({
                timing: { mode: 'free', frequencyHz },
              })}
            />
          )}
        </div>
      )}

      {source.shape === 'freeform' && (
        <FreeformCvEditor
          points={source.freeformPoints}
          onChange={(freeformPoints) => patch({ freeformPoints })}
        />
      )}

      {source.shape === 'gateSequencer' && (
        <GateStepEditor
          stepCount={source.stepCount}
          steps={source.gateSteps}
          onChange={(gateSteps) => patch({ gateSteps })}
        />
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
        ) : source.shape !== 'freeform' ? (
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
        ) : null}

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
