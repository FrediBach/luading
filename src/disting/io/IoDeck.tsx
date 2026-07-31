import type { TraceHistory } from '../emulation/trace-history'
import { PanelEmptyState } from '../PanelEmptyState'
import type {
  LoadedProgram,
  ScopeProbe,
  ScopeSource,
  SignalSourceConfig,
} from '../types'
import { InputChannelTile } from './InputChannelTile'
import { AudioMasterControl } from './AudioMasterControl'
import { OutputChannelTile } from './OutputChannelTile'
import { useOutputAudio } from './useOutputAudio'

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
  sources: SignalSourceConfig[]
  values: number[]
  outputs: number[]
  probes: ScopeProbe[]
  focusedScopeProbe: number | null
  traceHistory: TraceHistory
  traceRevision: number
  onSourceChange(index: number, source: SignalSourceConfig): void
  onTrigger(index: number): void
  onProbeChange(index: number, source: ScopeSource | null): void
  onProbeFocus(index: number): void
}

export function IoDeck({
  program,
  sources,
  values,
  outputs,
  probes,
  focusedScopeProbe,
  traceHistory,
  traceRevision,
  onSourceChange,
  onTrigger,
  onProbeChange,
  onProbeFocus,
}: Props) {
  const trace = traceHistory.snapshot(traceRevision)
  const outputAudio = useOutputAudio(program, trace)

  return (
    <section className="io-deck" aria-label="Input and output controls">
      <header className="io-deck-header">
        <div className="io-global-controls">
          <AudioMasterControl
            enabled={outputAudio.enabled}
            level={outputAudio.level}
            waveform={outputAudio.waveform}
            error={outputAudio.error}
            onToggle={() => void outputAudio.toggleEnabled()}
            onLevelChange={outputAudio.changeLevel}
            onWaveformChange={outputAudio.changeWaveform}
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
                {sources.map((source, index) => (
                  <InputChannelTile
                    index={index}
                    name={program.inputNames[index] ?? `Input ${index + 1}`}
                    kind={program.inputKinds[index] ?? 'cv'}
                    source={source}
                    value={values[index] ?? 0}
                    traceHistory={traceHistory}
                    traceRevision={traceRevision}
                    probes={probes}
                    focusedScopeProbe={focusedScopeProbe}
                    onChange={(nextSource) => onSourceChange(index, nextSource)}
                    onTrigger={() => onTrigger(index)}
                    onProbeChange={onProbeChange}
                    onProbeFocus={onProbeFocus}
                    key={`${program.inputNames[index] ?? 'input'}-${index}`}
                  />
                ))}
                <ChannelGridSpacers count={sources.length} />
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
                {outputAudio.routes.map((route, index) => (
                  <OutputChannelTile
                    index={index}
                    name={program.outputNames[index] ?? `Output ${index + 1}`}
                    kind={program.outputKinds[index] ?? 'linear'}
                    value={outputs[index] ?? 0}
                    traceHistory={traceHistory}
                    traceRevision={traceRevision}
                    route={route.destination}
                    audioEnabled={outputAudio.enabled}
                    audioError={outputAudio.error}
                    probes={probes}
                    focusedScopeProbe={focusedScopeProbe}
                    onRouteChange={(destination) => (
                      outputAudio.changeRoute(index, destination)
                    )}
                    onProbeChange={onProbeChange}
                    onProbeFocus={onProbeFocus}
                    key={`${program.outputNames[index] ?? 'output'}-${index}`}
                  />
                ))}
                <ChannelGridSpacers count={outputAudio.routes.length} />
              </>
            )}
          </div>
        </section>
      </div>
    </section>
  )
}
