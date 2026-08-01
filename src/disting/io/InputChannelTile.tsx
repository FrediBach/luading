import { useRef, useState } from 'react'
import {
  ControlPopover,
  ControlTile,
  ControlIcon,
  CornerAction,
  MiniSignalPlot,
  SignalShapeGlyph,
  ValueField,
} from '../controls'
import {
  CLOCK_DIVISIONS,
  defaultSignalSource,
  SIGNAL_SHAPES,
} from '../emulation/signal-sources'
import type { TraceHistory } from '../emulation/trace-history'
import type {
  InputKind,
  InputChannelRoute,
  ScopeProbe,
  ScopeSource,
  SignalSourceConfig,
  WebMidiDeviceState,
} from '../types'
import { assignedProbeIndex } from '../drawer/scope-controls'
import { formatDisplayFloat } from '../display-format'
import { InputChannelInspector } from './InputChannelInspector'
import { inputDefaultEntry } from './io-default-entries'
import {
  IoDefaultContextMenu,
  type ContextMenuPoint,
} from './IoDefaultContextMenu'
import {
  ScopeAssignmentButton,
  ScopeProbeChooser,
} from './ScopeAssignmentButton'
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
  route: InputChannelRoute
  devices: WebMidiDeviceState
  value: number
  traceHistory: TraceHistory
  traceRevision: number
  probes: readonly ScopeProbe[]
  focusedScopeProbe: number | null
  onChange(route: InputChannelRoute): void
  onConnectMidi(): void
  onTrigger(): void
  onProbeChange(index: number, source: ScopeSource | null): void
  onProbeFocus(index: number): void
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
  route,
  devices,
  value,
  traceHistory,
  traceRevision,
  probes,
  focusedScopeProbe,
  onChange,
  onConnectMidi,
  onTrigger,
  onProbeChange,
  onProbeFocus,
}: Props) {
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [scopeChooserOpen, setScopeChooserOpen] = useState(false)
  const [contextMenuPoint, setContextMenuPoint] = useState<ContextMenuPoint | null>(null)
  const tileRef = useRef<HTMLElement>(null)
  const scopeSource = { kind: 'input' as const, index }
  const assignedScopeProbe = assignedProbeIndex(probes, scopeSource)
  const trace = traceHistory.snapshot(traceRevision)
  const traceValues = inputTraceValues(trace, index)
  const source = route.kind === 'generator'
    ? route.source
    : defaultSignalSource(kind, index)
  const range = inputPlotRange(source, traceValues)
  const clockDivision = source.timing.mode === 'clock'
    ? source.timing.division
    : null
  const freeFrequency = source.timing.mode === 'free'
    ? source.timing.frequencyHz
    : 1
  const patch = (update: Partial<SignalSourceConfig>) => {
    onChange({ kind: 'generator', source: { ...source, ...update } })
  }

  const midiPort = route.kind === 'webMidi'
    ? devices.inputs.find((port) => port.id === route.mapping.portId)
    : undefined
  const midiState = route.kind === 'webMidi'
    ? devices.status === 'denied' || devices.status === 'error' || devices.status === 'unsupported'
      ? 'Error'
      : !route.mapping.portId
        ? 'Ready'
        : !midiPort || midiPort.state !== 'connected'
          ? 'Disconnected'
          : devices.status === 'ready'
            ? 'Live'
            : 'Ready'
    : null

  const primaryControl = route.kind === 'webMidi' ? (
    <span className={`input-channel-midi-state input-channel-midi-state--${midiState?.toLowerCase()}`}>
      {midiState}
    </span>
  ) : source.shape === 'manual' ? (
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
      formatValue={formatDisplayFloat}
      onChange={(frequencyHz) => patch({
        timing: { mode: 'free', frequencyHz },
      })}
    />
  )

  return (
    <div className={`input-channel-tile-shell${
      assignedScopeProbe >= 0 ? ` scope-probe--${assignedScopeProbe + 1}` : ''
    }`}>
      <ControlTile
        ref={tileRef}
        label={`IN ${index + 1}`}
        meta={`${kind} · ${name}`}
        selected={inspectorOpen || scopeChooserOpen || contextMenuPoint !== null}
        onActivate={() => {
          setContextMenuPoint(null)
          setScopeChooserOpen(false)
          setInspectorOpen(true)
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          setInspectorOpen(false)
          setScopeChooserOpen(false)
          setContextMenuPoint({ x: event.clientX, y: event.clientY })
        }}
        actions={(
          <>
            {route.kind === 'generator' && inputUsesTiming(source) && (
              <CornerAction
                icon="sync"
                label={`${name} clock sync`}
                pressed={source.timing.mode === 'clock'}
                onClick={() => onChange({
                  kind: 'generator',
                  source: inputWithSync(source, source.timing.mode !== 'clock'),
                })}
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
        footerAction={(
          <ScopeAssignmentButton
            label={`IN ${index + 1} · ${name}`}
            source={scopeSource}
            probes={probes}
            onProbeChange={onProbeChange}
            onProbeFocus={onProbeFocus}
            onRequestChooser={() => {
              setInspectorOpen(false)
              setScopeChooserOpen(true)
            }}
          />
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
            {route.kind === 'generator' ? (
              <SignalShapeGlyph shape={source.shape} size={21} />
            ) : (
              <span className="input-channel-midi-glyph"><ControlIcon name="midi" size={18} /></span>
            )}
          </div>
        )}
        value={(
          <span className="input-channel-value">
            <output>{formatDisplayFloat(value)} V</output>
            {primaryControl}
          </span>
        )}
        footer={route.kind === 'generator'
          ? timingLabel(source)
          : `Web MIDI · ${midiState}`}
      />

      {contextMenuPoint && (
        <IoDefaultContextMenu
          label={`IN ${index + 1} · ${name}`}
          point={contextMenuPoint}
          entry={route.kind === 'generator' ? inputDefaultEntry(kind, source) : null}
          anchorRef={tileRef}
          unavailableReason="Web MIDI input routes cannot be set by Lua default annotations."
          onClose={() => setContextMenuPoint(null)}
        />
      )}

      <ControlPopover
        open={inspectorOpen}
        label={`IN ${index + 1} · ${name}`}
        anchorRef={tileRef}
        positioning="viewport"
        preferredWidth={470}
        onClose={() => setInspectorOpen(false)}
      >
        <InputChannelInspector
          kind={kind}
          route={route}
          devices={devices}
          onChange={onChange}
          onConnectMidi={onConnectMidi}
        />
      </ControlPopover>

      <ControlPopover
        open={scopeChooserOpen}
        label={`IN ${index + 1} · scope assignment`}
        anchorRef={tileRef}
        positioning="viewport"
        preferredWidth={470}
        onClose={() => setScopeChooserOpen(false)}
      >
        <ScopeProbeChooser
          label={`IN ${index + 1} · ${name}`}
          source={scopeSource}
          probes={probes}
          focusedProbeIndex={focusedScopeProbe}
          onChoose={(probeIndex) => {
            onProbeChange(probeIndex, scopeSource)
            onProbeFocus(probeIndex)
            setScopeChooserOpen(false)
          }}
          onUnassign={(probeIndex) => {
            onProbeChange(probeIndex, null)
            setScopeChooserOpen(false)
          }}
        />
      </ControlPopover>
    </div>
  )
}
