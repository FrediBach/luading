import {
  CLOCK_DIVISIONS,
  SIGNAL_SHAPES,
} from './emulation/signal-sources'
import type {
  GlobalClockConfig,
  LoadedProgram,
  SignalSourceConfig,
} from './types'

interface Props {
  program: LoadedProgram
  sources: SignalSourceConfig[]
  values: number[]
  clock: GlobalClockConfig
  onClockChange: (clock: GlobalClockConfig) => void
  onSourceChange: (index: number, source: SignalSourceConfig) => void
  onTrigger: (index: number) => void
}

function usesTiming(source: SignalSourceConfig) {
  return source.shape !== 'manual' && source.shape !== 'noise'
}

function usesPulseWidth(source: SignalSourceConfig) {
  return source.shape === 'square'
    || source.shape === 'gate'
    || source.shape === 'trigger'
    || source.shape === 'gateSequencer'
}

function usesStepCount(source: SignalSourceConfig) {
  return source.shape === 'gateSequencer'
    || source.shape === 'noteSequencer'
    || source.shape === 'arpeggio'
}

function shapeDefaults(source: SignalSourceConfig, shape: SignalSourceConfig['shape']) {
  const sequenceShape = shape === 'gateSequencer'
    || shape === 'noteSequencer'
    || shape === 'arpeggio'

  return {
    shape,
    stepCount: sequenceShape ? 8 : source.stepCount,
    amplitude: shape === 'noteSequencer' || shape === 'arpeggio'
      ? 1
      : shape === 'gateSequencer'
        ? 5
        : source.amplitude,
  }
}

export function InputPatchBay({
  program,
  sources,
  values,
  clock,
  onClockChange,
  onSourceChange,
  onTrigger,
}: Props) {
  const patch = (index: number, update: Partial<SignalSourceConfig>) => {
    const source = sources[index]
    if (!source) return
    onSourceChange(index, { ...source, ...update })
  }

  return (
    <section className="disting-patch-bay" aria-label="Input signal patch bay">
      <div className="disting-subpanel-head">
        <div>
          <span className="disting-panel-kicker">INPUT SOURCES</span>
          <strong>Signal patch bay</strong>
        </div>
        <label className="disting-clock-control">
          <span>Global clock</span>
          <input
            type="number"
            min="1"
            max="999"
            step="1"
            value={clock.bpm}
            onChange={(event) => onClockChange({ ...clock, bpm: Number(event.target.value) })}
          />
          <span>BPM</span>
          <button
            type="button"
            className={clock.running ? 'is-active' : ''}
            onClick={() => onClockChange({ ...clock, running: !clock.running })}
          >
            {clock.running ? 'running' : 'stopped'}
          </button>
        </label>
      </div>

      <div className="disting-input-list">
        {sources.map((source, index) => (
          <article className="disting-input-channel" key={`${program.inputNames[index]}-${index}`}>
            <div className="disting-input-title">
              <div>
                <span>IN {index + 1} · {program.inputKinds[index]}</span>
                <strong>{program.inputNames[index]}</strong>
              </div>
              <output>{(values[index] ?? 0).toFixed(3)} V</output>
            </div>

            <div className="disting-input-config">
              <label>
                <span>Signal</span>
                <select
                  value={source.shape}
                  onChange={(event) => patch(
                    index,
                    shapeDefaults(source, event.target.value as SignalSourceConfig['shape']),
                  )}
                >
                  {SIGNAL_SHAPES.map((shape) => (
                    <option value={shape.value} key={shape.value}>{shape.label}</option>
                  ))}
                </select>
              </label>

              {usesTiming(source) && (
                <>
                  <label>
                    <span>Timing</span>
                    <select
                      value={source.timing.mode}
                      onChange={(event) => patch(index, {
                        timing: event.target.value === 'clock'
                          ? { mode: 'clock', division: '1/4' }
                          : { mode: 'free', frequencyHz: 1 },
                      })}
                    >
                      <option value="clock">Clocked</option>
                      <option value="free">Free</option>
                    </select>
                  </label>

                  {source.timing.mode === 'clock' ? (
                    <label>
                      <span>Division</span>
                      <select
                        value={source.timing.division}
                        onChange={(event) => patch(index, {
                          timing: {
                            mode: 'clock',
                            division: event.target.value as typeof source.timing.division,
                          },
                        })}
                      >
                        {CLOCK_DIVISIONS.map((division) => (
                          <option value={division} key={division}>{division}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label>
                      <span>Rate Hz</span>
                      <input
                        type="number"
                        min="0.001"
                        max="100"
                        step="0.01"
                        value={source.timing.frequencyHz}
                        onChange={(event) => patch(index, {
                          timing: { mode: 'free', frequencyHz: Number(event.target.value) },
                        })}
                      />
                    </label>
                  )}
                </>
              )}

              {source.shape === 'manual' ? (
                <label className="disting-input-wide">
                  <span>Voltage</span>
                  <input
                    type="range"
                    min="-10"
                    max="10"
                    step="0.01"
                    value={source.manualValue}
                    onChange={(event) => patch(index, { manualValue: Number(event.target.value) })}
                  />
                </label>
              ) : (
                <>
                  <label>
                    <span>Amplitude V</span>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={source.amplitude}
                      onChange={(event) => patch(index, { amplitude: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span>Offset V</span>
                    <input
                      type="number"
                      min="-10"
                      max="10"
                      step="0.1"
                      value={source.offset}
                      onChange={(event) => patch(index, { offset: Number(event.target.value) })}
                    />
                  </label>
                </>
              )}

              {usesPulseWidth(source) && (
                <label>
                  <span>Width %</span>
                  <input
                    type="number"
                    min="0.1"
                    max="99"
                    step="0.1"
                    value={Number((source.pulseWidth * 100).toFixed(1))}
                    onChange={(event) => patch(index, { pulseWidth: Number(event.target.value) / 100 })}
                  />
                </label>
              )}

              {usesStepCount(source) && (
                <label>
                  <span>Steps</span>
                  <input
                    type="number"
                    min="1"
                    max="32"
                    step="1"
                    value={source.stepCount}
                    onChange={(event) => patch(index, { stepCount: Number(event.target.value) })}
                  />
                </label>
              )}

              {program.inputKinds[index] === 'trigger' && (
                <button
                  type="button"
                  className="disting-pulse-button"
                  onPointerDown={() => onTrigger(index)}
                >
                  Fire once
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
