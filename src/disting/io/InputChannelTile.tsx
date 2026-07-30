import { useRef, useState } from 'react'
import {
  ControlPopover,
  ControlTile,
  CornerAction,
  MiniSignalPlot,
  SignalShapeGlyph,
  ValueField,
} from '../controls'
import { CLOCK_DIVISIONS, SIGNAL_SHAPES } from '../emulation/signal-sources'
import type {
  InputKind,
  SignalSourceConfig,
  TracePoint,
} from '../types'
import { InputChannelInspector } from './InputChannelInspector'
import {
  adjacentClockDivision,
  inputIsStepped,
  inputPlotRange,
  inputTraceValues,
  inputUsesTiming,
  inputWithSync,
} from './input-source-controls'

interface Props {
  index: number
  name: string
  kind: InputKind
  source: SignalSourceConfig
  value: number
  trace: readonly TracePoint[]
  onChange(source: SignalSourceConfig): void
  onTrigger(): void
}

function shapeLabel(source: SignalSourceConfig) {
  return SIGNAL_SHAPES.find((shape) => shape.value === source.shape)?.label ?? source.shape
}

function timingLabel(source: SignalSourceConfig) {
  if (!inputUsesTiming(source)) return shapeLabel(source)
  return source.timing.mode === 'clock'
    ? `${shapeLabel(source)} · ${source.timing.division}`
    : `${shapeLabel(source)} · ${source.timing.frequencyHz.toFixed(2)} Hz`
}

export function InputChannelTile({
  index,
  name,
  kind,
  source,
  value,
  trace,
  onChange,
  onTrigger,
}: Props) {
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const tileRef = useRef<HTMLElement>(null)
  const traceValues = inputTraceValues(trace, index)
  const range = inputPlotRange(source, traceValues)
  const clockDivision = source.timing.mode === 'clock'
    ? source.timing.division
    : null
  const freeFrequency = source.timing.mode === 'free'
    ? source.timing.frequencyHz
    : 1
  const patch = (update: Partial<SignalSourceConfig>) => {
    onChange({ ...source, ...update })
  }

  const primaryControl = source.shape === 'manual' ? (
    <ValueField
      label={`${name} voltage`}
      value={source.manualValue}
      min={-10}
      max={10}
      step={0.01}
      unit="V"
      onChange={(manualValue) => patch({ manualValue })}
    />
  ) : source.shape === 'noise' ? (
    <ValueField
      label={`${name} amplitude`}
      value={source.amplitude}
      min={0}
      max={10}
      step={0.01}
      unit="V"
      onChange={(amplitude) => patch({ amplitude })}
    />
  ) : clockDivision !== null ? (
    <div className="input-division-stepper" aria-label={`${name} clock division`}>
      <button
        type="button"
        aria-label={`Slower ${name} clock division`}
        disabled={clockDivision === CLOCK_DIVISIONS[0]}
        onClick={() => patch({
          timing: {
            mode: 'clock',
            division: adjacentClockDivision(clockDivision, -1),
          },
        })}
      >
        −
      </button>
      <output>{clockDivision}</output>
      <button
        type="button"
        aria-label={`Faster ${name} clock division`}
        disabled={clockDivision === CLOCK_DIVISIONS.at(-1)}
        onClick={() => patch({
          timing: {
            mode: 'clock',
            division: adjacentClockDivision(clockDivision, 1),
          },
        })}
      >
        +
      </button>
    </div>
  ) : (
    <ValueField
      label={`${name} rate`}
      value={freeFrequency}
      min={0.001}
      max={100}
      step={0.001}
      unit="Hz"
      formatValue={(frequency) => frequency < 1 ? frequency.toFixed(3) : frequency.toFixed(2)}
      onChange={(frequencyHz) => patch({
        timing: { mode: 'free', frequencyHz },
      })}
    />
  )

  return (
    <div className="input-channel-tile-shell">
      <ControlTile
        ref={tileRef}
        label={`IN ${index + 1}`}
        meta={`${kind} · ${name}`}
        selected={inspectorOpen}
        onActivate={() => setInspectorOpen(true)}
        actions={(
          <>
            {inputUsesTiming(source) && (
              <CornerAction
                icon="sync"
                label={`${name} clock sync`}
                pressed={source.timing.mode === 'clock'}
                onClick={() => onChange(inputWithSync(
                  source,
                  source.timing.mode !== 'clock',
                ))}
              />
            )}
            {kind === 'trigger' && (
              <CornerAction
                icon="trigger"
                label={`Fire ${name}`}
                onClick={onTrigger}
              />
            )}
          </>
        )}
        visual={(
          <div className="input-channel-visual">
            <MiniSignalPlot
              label={`${name} recent voltage`}
              values={traceValues}
              min={range.min}
              max={range.max}
              stepped={inputIsStepped(source)}
            />
            <SignalShapeGlyph shape={source.shape} size={21} />
          </div>
        )}
        value={(
          <span className="input-channel-value">
            <output>{value.toFixed(3)} V</output>
            {primaryControl}
          </span>
        )}
        footer={timingLabel(source)}
      />

      <ControlPopover
        open={inspectorOpen}
        label={`IN ${index + 1} · ${name}`}
        anchorRef={tileRef}
        onClose={() => setInspectorOpen(false)}
      >
        <InputChannelInspector source={source} onChange={onChange} />
      </ControlPopover>
    </div>
  )
}
