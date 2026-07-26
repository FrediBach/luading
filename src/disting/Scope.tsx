import { useMemo, useState } from 'react'
import {
  readTracePoint,
  selectAutomaticTrigger,
  selectScopeWindow,
  type TriggerEdge,
  type TriggerSelection,
} from './emulation/scope-model'
import type {
  LoadedProgram,
  ScopeProbe,
  ScopeSource,
  TracePoint,
} from './types'

const WIDTH = 800
const HEIGHT = 210
const HORIZONTAL_DIVISIONS = 10
const VERTICAL_DIVISIONS = 4
const PRE_TRIGGER_RATIO = 0.2
const TIME_PER_DIVISION_MS = [5, 10, 25, 50, 100, 200, 500] as const
const VOLTS_PER_DIVISION = [0.5, 1, 2, 5, 10] as const

interface Props {
  trace: TracePoint[]
  probes: ScopeProbe[]
  program: LoadedProgram | null
  inputs: number[]
  outputs: number[]
  onProbeChange: (index: number, source: ScopeSource | null) => void
}

function yForVoltage(voltage: number, voltsPerDivision: number) {
  const range = voltsPerDivision * VERTICAL_DIVISIONS / 2
  const clamped = Math.min(range, Math.max(-range, voltage))
  return HEIGHT - ((clamped + range) / (range * 2)) * HEIGHT
}

function pathFor(
  trace: TracePoint[],
  source: ScopeSource | null,
  startTime: number,
  endTime: number,
  voltsPerDivision: number,
) {
  if (trace.length === 0 || !source) return ''
  const duration = Math.max(0.001, endTime - startTime)

  return trace
    .map((point, index) => {
      const x = ((point.time - startTime) / duration) * WIDTH
      const y = yForVoltage(readTracePoint(point, source), voltsPerDivision)
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function encodeSource(source: ScopeSource | null) {
  return source ? `${source.kind}:${source.index}` : ''
}

function decodeSource(value: string): ScopeSource | null {
  if (!value) return null
  const [kind, rawIndex] = value.split(':')
  const index = Number(rawIndex)
  if ((kind !== 'input' && kind !== 'output') || !Number.isInteger(index)) return null
  return { kind, index }
}

function sourceLabel(source: ScopeSource | null, program: LoadedProgram | null) {
  if (!source || !program) return 'Unpatched'
  return source.kind === 'input'
    ? `IN ${source.index + 1} · ${program.inputNames[source.index] ?? 'Input'}`
    : `OUT ${source.index + 1} · ${program.outputNames[source.index] ?? 'Output'}`
}

function currentValue(source: ScopeSource | null, inputs: number[], outputs: number[]) {
  if (!source) return 0
  return source.kind === 'input'
    ? inputs[source.index] ?? 0
    : outputs[source.index] ?? 0
}

function formatVoltage(value: number) {
  const absolute = Math.abs(value)
  const formatted = absolute >= 10 ? absolute.toFixed(0) : absolute.toFixed(1)
  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${formatted}V`
}

export function Scope({
  trace,
  probes,
  program,
  inputs,
  outputs,
  onProbeChange,
}: Props) {
  const [syncEnabled, setSyncEnabled] = useState(true)
  const [triggerProbe, setTriggerProbe] = useState<'auto' | number>('auto')
  const [triggerEdge, setTriggerEdge] = useState<TriggerEdge>('rising')
  const [triggerLevel, setTriggerLevel] = useState(0)
  const [timeZoomIndex, setTimeZoomIndex] = useState(3)
  const [voltageZoomIndex, setVoltageZoomIndex] = useState(3)

  const timePerDivision = TIME_PER_DIVISION_MS[timeZoomIndex] ?? 50
  const voltsPerDivision = VOLTS_PER_DIVISION[voltageZoomIndex] ?? 5
  const durationSeconds = timePerDivision * HORIZONTAL_DIVISIONS / 1000

  const automaticTrigger = useMemo(
    () => selectAutomaticTrigger(trace, probes.map((probe) => probe.source)),
    [probes, trace],
  )

  const selectedTrigger = useMemo<TriggerSelection | null>(() => {
    if (!syncEnabled) return null
    if (triggerProbe === 'auto') return automaticTrigger
    const source = probes[triggerProbe]?.source
    return source ? { source, level: triggerLevel, probeIndex: triggerProbe } : null
  }, [automaticTrigger, probes, syncEnabled, triggerLevel, triggerProbe])

  const scopeWindow = useMemo(
    () => selectScopeWindow(
      trace,
      durationSeconds,
      selectedTrigger,
      triggerEdge,
      PRE_TRIGGER_RATIO,
    ),
    [durationSeconds, selectedTrigger, trace, triggerEdge],
  )

  const triggerStatus = !syncEnabled
    ? 'free run'
    : scopeWindow.locked
      ? `locked · CH ${selectedTrigger ? selectedTrigger.probeIndex + 1 : '-'}`
      : 'waiting for edge'

  const voltageRange = voltsPerDivision * VERTICAL_DIVISIONS / 2
  const triggerVisible = selectedTrigger
    && selectedTrigger.level >= -voltageRange
    && selectedTrigger.level <= voltageRange

  const zoomTime = (direction: -1 | 1) => {
    setTimeZoomIndex((current) => (
      Math.min(TIME_PER_DIVISION_MS.length - 1, Math.max(0, current + direction))
    ))
  }

  const zoomVoltage = (direction: -1 | 1) => {
    setVoltageZoomIndex((current) => (
      Math.min(VOLTS_PER_DIVISION.length - 1, Math.max(0, current + direction))
    ))
  }

  return (
    <section className="disting-scope">
      <div className="disting-scope-header">
        <div>
          <span>CV scope</span>
          <small>{timePerDivision} ms/div · {voltsPerDivision} V/div</small>
        </div>
        <div className="disting-scope-routing" aria-label="Oscilloscope routing">
          {probes.map((probe, index) => (
            <label key={probe.id} className={`scope-probe scope-probe--${index + 1}`}>
              <i />
              <select
                value={encodeSource(probe.source)}
                onChange={(event) => onProbeChange(index, decodeSource(event.target.value))}
                aria-label={`Scope probe ${index + 1}`}
              >
                <option value="">Unpatched</option>
                {program?.inputNames.map((name, inputIndex) => (
                  <option value={`input:${inputIndex}`} key={`input:${inputIndex}`}>
                    IN {inputIndex + 1} · {name}
                  </option>
                ))}
                {program?.outputNames.map((name, outputIndex) => (
                  <option value={`output:${outputIndex}`} key={`output:${outputIndex}`}>
                    OUT {outputIndex + 1} · {name}
                  </option>
                ))}
              </select>
              <output>{currentValue(probe.source, inputs, outputs).toFixed(3)} V</output>
            </label>
          ))}
        </div>
      </div>

      <div className="disting-scope-controls">
        <label>
          <span>Mode</span>
          <select
            value={syncEnabled ? 'sync' : 'free'}
            onChange={(event) => setSyncEnabled(event.target.value === 'sync')}
          >
            <option value="sync">Auto sync</option>
            <option value="free">Free run</option>
          </select>
        </label>

        {syncEnabled && (
          <>
            <label>
              <span>Trigger</span>
              <select
                value={triggerProbe}
                onChange={(event) => setTriggerProbe(
                  event.target.value === 'auto' ? 'auto' : Number(event.target.value),
                )}
              >
                <option value="auto">Auto source + level</option>
                {probes.map((probe, index) => (
                  <option value={index} key={probe.id}>
                    CH {index + 1} · {sourceLabel(probe.source, program)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Edge</span>
              <select
                value={triggerEdge}
                onChange={(event) => setTriggerEdge(event.target.value as TriggerEdge)}
              >
                <option value="rising">Rising</option>
                <option value="falling">Falling</option>
              </select>
            </label>
            {triggerProbe !== 'auto' && (
              <label>
                <span>Level V</span>
                <input
                  type="number"
                  min="-10"
                  max="10"
                  step="0.1"
                  value={triggerLevel}
                  onChange={(event) => setTriggerLevel(Number(event.target.value))}
                />
              </label>
            )}
          </>
        )}

        <div className={`scope-trigger-status${scopeWindow.locked ? ' is-locked' : ''}`}>
          <i />
          {triggerStatus}
        </div>

        <div className="scope-zoom-control">
          <span>Horizontal zoom</span>
          <button
            type="button"
            onClick={() => zoomTime(1)}
            disabled={timeZoomIndex === TIME_PER_DIVISION_MS.length - 1}
            aria-label="Zoom time out"
          >
            -
          </button>
          <output>{timePerDivision} ms/div</output>
          <button
            type="button"
            onClick={() => zoomTime(-1)}
            disabled={timeZoomIndex === 0}
            aria-label="Zoom time in"
          >
            +
          </button>
        </div>

        <div className="scope-zoom-control">
          <span>Vertical zoom</span>
          <button
            type="button"
            onClick={() => zoomVoltage(1)}
            disabled={voltageZoomIndex === VOLTS_PER_DIVISION.length - 1}
            aria-label="Zoom voltage out"
          >
            -
          </button>
          <output>{voltsPerDivision} V/div</output>
          <button
            type="button"
            onClick={() => zoomVoltage(-1)}
            disabled={voltageZoomIndex === 0}
            aria-label="Zoom voltage in"
          >
            +
          </button>
        </div>
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Synchronized input and output voltage traces">
        <title>Oscilloscope traces</title>
        <desc>
          Ten horizontal time divisions and four vertical voltage divisions.
          {scopeWindow.locked ? ' The display is locked to a trigger edge.' : ''}
        </desc>

        {Array.from({ length: HORIZONTAL_DIVISIONS + 1 }, (_, index) => (
          <line
            className="scope-grid scope-grid--vertical"
            x1={index * WIDTH / HORIZONTAL_DIVISIONS}
            x2={index * WIDTH / HORIZONTAL_DIVISIONS}
            y1="0"
            y2={HEIGHT}
            key={`vertical-${index}`}
          />
        ))}
        {Array.from({ length: VERTICAL_DIVISIONS + 1 }, (_, index) => {
          const voltage = voltageRange - index * voltsPerDivision
          const y = yForVoltage(voltage, voltsPerDivision)
          return (
            <line
              className={Math.abs(voltage) < 0.0001 ? 'scope-zero' : 'scope-grid'}
              x1="0"
              x2={WIDTH}
              y1={y}
              y2={y}
              key={`horizontal-${index}`}
            />
          )
        })}

        {triggerVisible && (
          <line
            className="scope-trigger-level"
            x1="0"
            x2={WIDTH}
            y1={yForVoltage(selectedTrigger.level, voltsPerDivision)}
            y2={yForVoltage(selectedTrigger.level, voltsPerDivision)}
          />
        )}
        {scopeWindow.locked && (
          <line
            className="scope-trigger-time"
            x1={WIDTH * PRE_TRIGGER_RATIO}
            x2={WIDTH * PRE_TRIGGER_RATIO}
            y1="0"
            y2={HEIGHT}
          />
        )}

        <text x="8" y="12">{formatVoltage(voltageRange)}</text>
        <text x="8" y={HEIGHT / 2 - 5}>0V</text>
        <text x="8" y={HEIGHT - 6}>{formatVoltage(-voltageRange)}</text>
        {probes.map((probe, index) => (
          <path
            className={`scope-path scope-path--${index + 1}`}
            d={pathFor(
              scopeWindow.points,
              probe.source,
              scopeWindow.startTime,
              scopeWindow.endTime,
              voltsPerDivision,
            )}
            key={probe.id}
          >
            <title>{sourceLabel(probe.source, program)}</title>
          </path>
        ))}
      </svg>
    </section>
  )
}
