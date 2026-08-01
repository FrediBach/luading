import { useRef, useState } from 'react'
import {
  ControlPopover,
  ControlTile,
  CornerAction,
  MiniSignalPlot,
} from '../controls'
import type { TraceHistory } from '../emulation/trace-history'
import type {
  OutputChannelRoute,
  OutputKind,
  ScopeProbe,
  ScopeSource,
  WebMidiDeviceState,
} from '../types'
import { assignedProbeIndex } from '../drawer/scope-controls'
import { formatDisplayFloat } from '../display-format'
import {
  outputRouteLabel,
  outputPlotRange,
  outputTraceValues,
} from './output-audio-controls'
import { OutputRoutingPopover } from './OutputRoutingPopover'
import {
  ScopeAssignmentButton,
  ScopeProbeChooser,
} from './ScopeAssignmentButton'

interface Props {
  index: number
  name: string
  outputNames: readonly string[]
  kind: OutputKind
  value: number
  traceHistory: TraceHistory
  traceRevision: number
  route: OutputChannelRoute
  audioEnabled: boolean
  audioError: string | null
  midiDevices: WebMidiDeviceState
  midiError?: string
  probes: readonly ScopeProbe[]
  focusedScopeProbe: number | null
  onRouteChange(route: OutputChannelRoute): void
  onConnectMidi(): void
  onProbeChange(index: number, source: ScopeSource | null): void
  onProbeFocus(index: number): void
}

export function OutputChannelTile({
  index,
  name,
  outputNames,
  kind,
  value,
  traceHistory,
  traceRevision,
  route,
  audioEnabled,
  audioError,
  midiDevices,
  midiError,
  probes,
  focusedScopeProbe,
  onRouteChange,
  onConnectMidi,
  onProbeChange,
  onProbeFocus,
}: Props) {
  const [routingOpen, setRoutingOpen] = useState(false)
  const [scopeChooserOpen, setScopeChooserOpen] = useState(false)
  const tileRef = useRef<HTMLElement>(null)
  const scopeSource = { kind: 'output' as const, index }
  const assignedScopeProbe = assignedProbeIndex(probes, scopeSource)
  const trace = traceHistory.snapshot(traceRevision)
  const traceValues = outputTraceValues(trace, index)
  const range = outputPlotRange(traceValues)
  const routed = route.kind !== 'off'
  const routeLabel = outputRouteLabel(route)
  const midiRoute = route.kind === 'webMidiCc'
    || route.kind === 'webMidiPitchBend'
    || route.kind === 'webMidiNote'
  const midiPort = midiRoute
    ? midiDevices.outputs.find((port) => port.id === route.portId)
    : undefined
  const routeError = route.kind === 'webAudio' ? audioError : midiRoute ? midiError : undefined
  const routeState = route.kind === 'off'
    ? 'Off'
    : route.kind === 'webAudio'
      ? audioError
        ? 'Error'
        : audioEnabled
          ? 'Live'
          : 'Ready'
      : midiError || midiDevices.status === 'denied' || midiDevices.status === 'error' || midiDevices.status === 'unsupported'
        ? 'Error'
        : !route.portId
          ? 'Ready'
          : !midiPort || midiPort.state !== 'connected'
            ? 'Disconnected'
            : midiDevices.status === 'ready'
              ? 'Live'
              : 'Ready'
  const monitoring = routeState === 'Live'

  return (
    <div className={`output-channel-tile-shell${
      assignedScopeProbe >= 0 ? ` scope-probe--${assignedScopeProbe + 1}` : ''
    }`}>
      <ControlTile
        ref={tileRef}
        label={`OUT ${index + 1}`}
        meta={`${kind} · ${name}`}
        selected={routingOpen || scopeChooserOpen}
        status={routeError && routed ? 'error' : 'default'}
        actions={(
          <CornerAction
            icon={midiRoute ? 'midi' : 'speaker'}
            label={`Configure ${name} output route`}
            pressed={routed}
            tone={routeError && routed ? 'error' : 'default'}
            onClick={() => setRoutingOpen(true)}
          />
        )}
        footerAction={(
          <ScopeAssignmentButton
            label={`OUT ${index + 1} · ${name}`}
            source={scopeSource}
            probes={probes}
            onProbeChange={onProbeChange}
            onProbeFocus={onProbeFocus}
            onRequestChooser={() => {
              setRoutingOpen(false)
              setScopeChooserOpen(true)
            }}
          />
        )}
        visual={(
          <MiniSignalPlot
            label={`${name} recent output voltage`}
            values={traceValues}
            min={range.min}
            max={range.max}
            stepped={kind === 'stepped'}
          />
        )}
        value={(
          <span className="output-channel-value">
            <output>{formatDisplayFloat(value)} V</output>
            <span
              className={`output-channel-audio-state${
                monitoring ? ' is-monitoring' : routed ? ' is-routed' : ''
              }`}
            >
              {routeState}
            </span>
          </span>
        )}
        footer={routeLabel}
      />

      <OutputRoutingPopover
        open={routingOpen}
        label={`OUT ${index + 1} · ${name}`}
        outputIndex={index}
        outputKind={kind}
        outputNames={outputNames}
        route={route}
        audioEnabled={audioEnabled}
        midiDevices={midiDevices}
        midiError={midiError}
        anchorRef={tileRef}
        onChange={onRouteChange}
        onConnectMidi={onConnectMidi}
        onClose={() => setRoutingOpen(false)}
      />

      <ControlPopover
        open={scopeChooserOpen}
        label={`OUT ${index + 1} · scope assignment`}
        anchorRef={tileRef}
        positioning="viewport"
        preferredWidth={390}
        onClose={() => setScopeChooserOpen(false)}
      >
        <ScopeProbeChooser
          label={`OUT ${index + 1} · ${name}`}
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
