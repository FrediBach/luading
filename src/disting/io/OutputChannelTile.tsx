import { useRef, useState } from 'react'
import {
  ControlTile,
  CornerAction,
  MiniSignalPlot,
} from '../controls'
import type { AudioRouteDestination } from '../emulation/audio-routing'
import type { OutputKind, TracePoint } from '../types'
import {
  audioDestinationLabel,
  outputPlotRange,
  outputTraceValues,
} from './output-audio-controls'
import { OutputRoutingPopover } from './OutputRoutingPopover'

interface Props {
  index: number
  name: string
  kind: OutputKind
  value: number
  trace: readonly TracePoint[]
  route: AudioRouteDestination
  audioEnabled: boolean
  audioError: string | null
  onRouteChange(destination: AudioRouteDestination): void
}

export function OutputChannelTile({
  index,
  name,
  kind,
  value,
  trace,
  route,
  audioEnabled,
  audioError,
  onRouteChange,
}: Props) {
  const [routingOpen, setRoutingOpen] = useState(false)
  const tileRef = useRef<HTMLElement>(null)
  const traceValues = outputTraceValues(trace, index)
  const range = outputPlotRange(traceValues)
  const routed = route !== 'off'
  const routeLabel = audioDestinationLabel(route)
  const monitoring = routed && audioEnabled

  return (
    <div className="output-channel-tile-shell">
      <ControlTile
        ref={tileRef}
        label={`OUT ${index + 1}`}
        meta={`${kind} · ${name}`}
        selected={routingOpen}
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
    </div>
  )
}
