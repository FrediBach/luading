import { useRef, useState } from 'react'
import {
  ControlPopover,
  ControlTile,
  CornerAction,
  MiniSignalPlot,
} from '../controls'
import type { AudioRouteDestination } from '../emulation/audio-routing'
import type { TraceHistory } from '../emulation/trace-history'
import type {
  OutputKind,
  ScopeProbe,
  ScopeSource,
} from '../types'
import { assignedProbeIndex } from '../drawer/scope-controls'
import {
  audioDestinationLabel,
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
  kind: OutputKind
  value: number
  traceHistory: TraceHistory
  traceRevision: number
  route: AudioRouteDestination
  audioEnabled: boolean
  audioError: string | null
  probes: readonly ScopeProbe[]
  focusedScopeProbe: number | null
  onRouteChange(destination: AudioRouteDestination): void
  onProbeChange(index: number, source: ScopeSource | null): void
  onProbeFocus(index: number): void
}

export function OutputChannelTile({
  index,
  name,
  kind,
  value,
  traceHistory,
  traceRevision,
  route,
  audioEnabled,
  audioError,
  probes,
  focusedScopeProbe,
  onRouteChange,
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
  const routed = route !== 'off'
  const routeLabel = audioDestinationLabel(route)
  const monitoring = routed && audioEnabled

  return (
    <div className={`output-channel-tile-shell${
      assignedScopeProbe >= 0 ? ` scope-probe--${assignedScopeProbe + 1}` : ''
    }`}>
      <ControlTile
        ref={tileRef}
        label={`OUT ${index + 1}`}
        meta={`${kind} · ${name}`}
        selected={routingOpen || scopeChooserOpen}
        status={audioError && routed ? 'error' : 'default'}
        actions={(
          <CornerAction
            icon="speaker"
            label={`Configure ${name} WebAudio route`}
            pressed={routed}
            tone={audioError && routed ? 'error' : 'default'}
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
            <output>{value.toFixed(3)} V</output>
            <span
              className={`output-channel-audio-state${
                monitoring ? ' is-monitoring' : routed ? ' is-routed' : ''
              }`}
            >
              {monitoring ? 'Live' : routed ? 'Ready' : 'Off'}
            </span>
          </span>
        )}
        footer={routeLabel}
      />

      <OutputRoutingPopover
        open={routingOpen}
        label={`OUT ${index + 1} · ${name}`}
        route={route}
        audioEnabled={audioEnabled}
        anchorRef={tileRef}
        onChange={onRouteChange}
        onClose={() => setRoutingOpen(false)}
      />

      <ControlPopover
        open={scopeChooserOpen}
        label={`OUT ${index + 1} · scope assignment`}
        anchorRef={tileRef}
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
