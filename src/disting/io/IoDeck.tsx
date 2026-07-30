import { IconToggle, ValueField } from '../controls'
import type {
  GlobalClockConfig,
  LoadedProgram,
  SignalSourceConfig,
  TracePoint,
} from '../types'
import { InputChannelTile } from './InputChannelTile'
import { AudioMasterControl } from './AudioMasterControl'
import { OutputChannelTile } from './OutputChannelTile'
import { useOutputAudio } from './useOutputAudio'

interface Props {
  program: LoadedProgram
  sources: SignalSourceConfig[]
  values: number[]
  outputs: number[]
  trace: readonly TracePoint[]
  clock: GlobalClockConfig
  onClockChange(clock: GlobalClockConfig): void
  onSourceChange(index: number, source: SignalSourceConfig): void
  onTrigger(index: number): void
}

export function IoDeck({
  program,
  sources,
  values,
  outputs,
  trace,
  clock,
  onClockChange,
  onSourceChange,
  onTrigger,
}: Props) {
  const outputAudio = useOutputAudio(program, trace)

  return (
    <section className="io-deck" aria-label="Input and output controls">
      <header className="io-deck-header">
        <span>
          <small>I/O deck</small>
          <strong>Signal channels</strong>
        </span>
        <div className="io-global-controls">
          <div className="io-clock-control">
            <IconToggle
              icon="clock"
              label="Global test-signal clock"
              pressed={clock.running}
              onChange={(running) => onClockChange({ ...clock, running })}
            />
            <ValueField
              label="Global clock tempo"
              value={clock.bpm}
              min={1}
              max={999}
              step={1}
              unit="BPM"
              onChange={(bpm) => onClockChange({ ...clock, bpm })}
            />
          </div>
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
            {sources.map((source, index) => (
              <InputChannelTile
                index={index}
                name={program.inputNames[index] ?? `Input ${index + 1}`}
                kind={program.inputKinds[index] ?? 'cv'}
                source={source}
                value={values[index] ?? 0}
                trace={trace}
                onChange={(nextSource) => onSourceChange(index, nextSource)}
                onTrigger={() => onTrigger(index)}
                key={`${program.inputNames[index] ?? 'input'}-${index}`}
              />
            ))}
          </div>
        </section>

        <section className="io-channel-group" aria-labelledby="io-output-heading">
          <h3 id="io-output-heading">Outputs <small>{program.outputCount}</small></h3>
          <div className="io-output-grid">
            {outputAudio.routes.map((route, index) => (
              <OutputChannelTile
                index={index}
                name={program.outputNames[index] ?? `Output ${index + 1}`}
                kind={program.outputKinds[index] ?? 'linear'}
                value={outputs[index] ?? 0}
                trace={trace}
                route={route.destination}
                audioEnabled={outputAudio.enabled}
                audioError={outputAudio.error}
                onRouteChange={(destination) => (
                  outputAudio.changeRoute(index, destination)
                )}
                key={`${program.outputNames[index] ?? 'output'}-${index}`}
              />
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}
