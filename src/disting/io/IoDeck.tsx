import { IconToggle, ValueField } from '../controls'
import type {
  GlobalClockConfig,
  LoadedProgram,
  SignalSourceConfig,
  TracePoint,
} from '../types'
import { InputChannelTile } from './InputChannelTile'

interface Props {
  program: LoadedProgram
  sources: SignalSourceConfig[]
  values: number[]
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
  trace,
  clock,
  onClockChange,
  onSourceChange,
  onTrigger,
}: Props) {
  return (
    <section className="io-deck" aria-label="Input and output controls">
      <header className="io-deck-header">
        <span>
          <small>I/O deck</small>
          <strong>Inputs</strong>
        </span>
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
      </header>

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
  )
}

