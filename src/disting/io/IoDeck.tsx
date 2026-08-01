import type { TraceHistory } from '../emulation/trace-history'
import type { DistingWebMidiManager } from '../emulation/web-midi'
import { PanelEmptyState } from '../PanelEmptyState'
import type {
  LoadedProgram,
  InputChannelRoute,
  ScopeProbe,
  ScopeSource,
  WebMidiDeviceState,
} from '../types'
import { InputChannelTile } from './InputChannelTile'
import { AudioMasterControl } from './AudioMasterControl'
import { OutputChannelTile } from './OutputChannelTile'
import { useOutputRouting } from './useOutputRouting'

const MINIMUM_CHANNEL_SLOTS = 4

function ChannelGridSpacers({ count }: { count: number }) {
  return Array.from(
    { length: Math.max(0, MINIMUM_CHANNEL_SLOTS - count) },
    (_, index) => (
      <div
        className="io-channel-grid-spacer"
        aria-hidden="true"
        key={`spacer-${index}`}
      />
    ),
  )
}

interface Props {
  program: LoadedProgram
  inputRoutes: InputChannelRoute[]
  midiDevices: WebMidiDeviceState
  midiManager: DistingWebMidiManager
  values: number[]
  outputs: number[]
  probes: ScopeProbe[]
  focusedScopeProbe: number | null
  traceHistory: TraceHistory
  traceRevision: number
  onInputRouteChange(index: number, route: InputChannelRoute): void
  onConnectMidi(): void
  onTrigger(index: number): void
  onProbeChange(index: number, source: ScopeSource | null): void
  onProbeFocus(index: number): void
}

export function IoDeck({
  program,
  inputRoutes,
  midiDevices,
  midiManager,
  values,
  outputs,
  probes,
  focusedScopeProbe,
  traceHistory,
  traceRevision,
  onInputRouteChange,
  onConnectMidi,
  onTrigger,
  onProbeChange,
  onProbeFocus,
}: Props) {
  const trace = traceHistory.snapshot(traceRevision)
  const outputRouting = useOutputRouting(program, trace, midiManager, midiDevices)

  return (
    <section className="io-deck" aria-label="Input and output controls">
      <header className="io-deck-header">
        <div className="io-global-controls">
          <AudioMasterControl
            enabled={outputRouting.audioEnabled}
            level={outputRouting.audioLevel}
            waveform={outputRouting.waveform}
            error={outputRouting.audioError}
            onToggle={() => void outputRouting.toggleAudio()}
            onLevelChange={outputRouting.changeAudioLevel}
            onWaveformChange={outputRouting.changeWaveform}
          />
        </div>
      </header>

      <div className="io-channel-groups">
        <section className="io-channel-group" aria-labelledby="io-input-heading">
          <h3 id="io-input-heading">Inputs <small>{program.inputCount}</small></h3>
          <div className="io-input-grid">
            {program.inputCount === 0 ? (
              <PanelEmptyState title="No inputs">
                Declare inputs in the script&apos;s init configuration to create
                test signals here.
              </PanelEmptyState>
            ) : (
              <>
                {inputRoutes.map((route, index) => (
                  <InputChannelTile
                    index={index}
                    name={program.inputNames[index] ?? `Input ${index + 1}`}
                    kind={program.inputKinds[index] ?? 'cv'}
                    route={route}
                    devices={midiDevices}
                    value={values[index] ?? 0}
                    traceHistory={traceHistory}
                    traceRevision={traceRevision}
                    probes={probes}
                    focusedScopeProbe={focusedScopeProbe}
                    onChange={(nextRoute) => onInputRouteChange(index, nextRoute)}
                    onConnectMidi={onConnectMidi}
                    onTrigger={() => onTrigger(index)}
                    onProbeChange={onProbeChange}
                    onProbeFocus={onProbeFocus}
                    key={`${program.inputNames[index] ?? 'input'}-${index}`}
                  />
                ))}
                <ChannelGridSpacers count={inputRoutes.length} />
              </>
            )}
          </div>
        </section>

        <section className="io-channel-group" aria-labelledby="io-output-heading">
          <h3 id="io-output-heading">Outputs <small>{program.outputCount}</small></h3>
          <div className="io-output-grid">
            {program.outputCount === 0 ? (
              <PanelEmptyState title="No outputs">
                Declare outputs in the script&apos;s init configuration to inspect
                and monitor signals here.
              </PanelEmptyState>
            ) : (
              <>
                {outputRouting.routes.map((route, index) => (
                  <OutputChannelTile
                    index={index}
                    name={program.outputNames[index] ?? `Output ${index + 1}`}
                    outputNames={program.outputNames}
                    kind={program.outputKinds[index] ?? 'linear'}
                    value={outputs[index] ?? 0}
                    traceHistory={traceHistory}
                    traceRevision={traceRevision}
                    route={route}
                    audioEnabled={outputRouting.audioEnabled}
                    audioError={outputRouting.audioError}
                    midiDevices={midiDevices}
                    midiError={route.kind === 'webMidiCc'
                      || route.kind === 'webMidiPitchBend'
                      || route.kind === 'webMidiNote'
                      ? outputRouting.midiErrors[route.portId]
                      : undefined}
                    probes={probes}
                    focusedScopeProbe={focusedScopeProbe}
                    onRouteChange={(nextRoute) => (
                      outputRouting.changeRoute(index, nextRoute)
                    )}
                    onConnectMidi={onConnectMidi}
                    onProbeChange={onProbeChange}
                    onProbeFocus={onProbeFocus}
                    key={`${program.outputNames[index] ?? 'output'}-${index}`}
                  />
                ))}
                <ChannelGridSpacers count={outputRouting.routes.length} />
              </>
            )}
          </div>
        </section>
      </div>
    </section>
  )
}
