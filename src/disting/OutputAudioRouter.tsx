import { useEffect, useMemo, useRef, useState } from 'react'
import type { LoadedProgram, TracePoint } from './types'
import {
  type AudioRouteDestination,
  type OutputAudioRoute,
} from './emulation/audio-routing'
import {
  DistingWebAudioRouter,
  type SynthWaveform,
} from './emulation/web-audio'

interface Props {
  program: LoadedProgram | null
  trace: TracePoint[]
}

const DESTINATIONS: ReadonlyArray<{ value: AudioRouteDestination; label: string }> = [
  { value: 'off', label: 'Not connected' },
  { value: 'kick', label: 'Kick trigger' },
  { value: 'snare', label: 'Snare trigger' },
  { value: 'hat', label: 'Hi-hat trigger' },
  { value: 'synthNote', label: 'Synth note · V/oct' },
  { value: 'synthTrigger', label: 'Synth trigger' },
]

const WAVEFORMS: ReadonlyArray<{ value: SynthWaveform; label: string }> = [
  { value: 'sawtooth', label: 'Saw' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'sine', label: 'Sine' },
]

function emptyRoutes(count: number): OutputAudioRoute[] {
  return Array.from({ length: count }, () => ({ destination: 'off' }))
}

export function OutputAudioRouter({ program, trace }: Props) {
  const processedTimeRef = useRef(Number.NEGATIVE_INFINITY)
  const [audio] = useState(() => new DistingWebAudioRouter())
  const [routes, setRoutes] = useState<OutputAudioRoute[]>([])
  const [enabled, setEnabled] = useState(false)
  const [level, setLevel] = useState(0.55)
  const [waveform, setWaveform] = useState<SynthWaveform>('sawtooth')
  const [audioError, setAudioError] = useState<string | null>(null)
  const activeRoutes = useMemo(
    () => Array.from(
      { length: program?.outputCount ?? 0 },
      (_, index) => routes[index] ?? { destination: 'off' as const },
    ),
    [program?.outputCount, routes],
  )

  useEffect(() => {
    const outputCount = program?.outputCount ?? 0
    processedTimeRef.current = Number.NEGATIVE_INFINITY
    audio.reset(outputCount)
  }, [audio, program])

  useEffect(() => {
    const freshTrace = trace.filter((point) => point.time > processedTimeRef.current)
    if (freshTrace.length === 0) {
      if (trace.length === 0) processedTimeRef.current = Number.NEGATIVE_INFINITY
      return
    }
    processedTimeRef.current = freshTrace[freshTrace.length - 1].time
    if (enabled) {
      audio.process(freshTrace, activeRoutes, {
        synthWaveform: waveform,
      })
    }
  }, [activeRoutes, audio, enabled, level, trace, waveform])

  useEffect(() => () => {
    void audio.close()
  }, [audio])

  if (!program) return null

  const toggleAudio = async () => {
    setAudioError(null)
    if (enabled) {
      audio.disable()
      setEnabled(false)
      return
    }
    try {
      await audio.enable(level)
      setEnabled(true)
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : 'WebAudio could not be started.')
    }
  }

  const changeRoute = (index: number, destination: AudioRouteDestination) => {
    setRoutes((previous) => {
      const next = previous.length >= program.outputCount
        ? [...previous]
        : [...previous, ...emptyRoutes(program.outputCount - previous.length)]
      next[index] = { destination }
      return next
    })
    audio.reset(program.outputCount)
  }

  const changeLevel = (nextLevel: number) => {
    setLevel(nextLevel)
    if (enabled) audio.setLevel(nextLevel)
  }

  return (
    <section className="disting-audio-router" aria-label="WebAudio output router">
      <div className="disting-subpanel-head">
        <div>
          <span className="disting-panel-kicker">AUDIO OUTPUT</span>
          <strong>WebAudio voice router</strong>
        </div>
        <div className="disting-audio-master">
          <label>
            <span>Master</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={level}
              onChange={(event) => changeLevel(Number(event.target.value))}
            />
            <output>{Math.round(level * 100)}%</output>
          </label>
          <button
            type="button"
            className={enabled ? 'is-active' : ''}
            onClick={() => void toggleAudio()}
          >
            <i />
            {enabled ? 'Audio on' : 'Enable audio'}
          </button>
        </div>
      </div>

      <div className="disting-audio-body">
        <div className="disting-audio-routes">
          {activeRoutes.map((route, index) => (
            <label className="disting-audio-route" key={`${program.outputNames[index]}-${index}`}>
              <span>
                <b>OUT {index + 1}</b>
                <small>{program.outputNames[index] ?? `Output ${index + 1}`}</small>
              </span>
              <select
                value={route.destination}
                onChange={(event) => changeRoute(
                  index,
                  event.target.value as AudioRouteDestination,
                )}
              >
                {DESTINATIONS.map((destination) => (
                  <option value={destination.value} key={destination.value}>
                    {destination.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <aside className="disting-synth-settings">
          <label>
            <span>Synth waveform</span>
            <select
              value={waveform}
              onChange={(event) => setWaveform(event.target.value as SynthWaveform)}
            >
              {WAVEFORMS.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <p>
            Drum and synth-trigger routes fire on a 1 V rising edge.
            Synth note uses 0 V = C3 and quantizes V/oct changes to semitones.
          </p>
          {audioError && <p className="disting-audio-error">{audioError}</p>}
        </aside>
      </div>
    </section>
  )
}
