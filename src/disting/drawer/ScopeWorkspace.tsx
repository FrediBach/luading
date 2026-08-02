import { useMemo, useState } from 'react'
import {
  readTracePoint,
  selectAutomaticTrigger,
  selectClockScopeWindow,
  selectScopeWindow,
  type ScopeTriggerSource,
  type TriggerEdge,
  type TriggerSelection,
} from '../emulation/scope-model'
import type { TraceHistory } from '../emulation/trace-history'
import type {
  LoadedProgram,
  ScopeProbe,
  ScopeSource,
  TracePoint,
} from '../types'
import {
  captureScopeFrame,
  downsampleScopeTrace,
  scopeSourceLabel,
  type CapturedScopeFrame,
} from './scope-controls'
import { ScopeLegend } from './ScopeLegend'
import { ScopePauseButton, ScopeToolbar } from './ScopeToolbar'
import './drawer.css'

const WIDTH = 1000
const HEIGHT = 180
const HORIZONTAL_DIVISIONS = 10
const VERTICAL_DIVISIONS = 4
const PRE_TRIGGER_RATIO = 0.2
const TIME_PER_DIVISION_MS = [5, 10, 25, 50, 100, 200, 500] as const
const VOLTS_PER_DIVISION = [0.5, 1, 2, 5, 10] as const

interface Props {
  traceHistory: TraceHistory
  traceRevision: number
  probes: ScopeProbe[]
  program: LoadedProgram | null
  inputs: number[]
  outputs: number[]
  focusedProbeIndex: number | null
  onProbeChange(index: number, source: ScopeSource | null): void
  onProbeFocus(index: number): void
}

function yForVoltage(voltage: number, voltsPerDivision: number) {
  const range = voltsPerDivision * VERTICAL_DIVISIONS / 2
  const clamped = Math.min(range, Math.max(-range, voltage))
  return HEIGHT - ((clamped + range) / (range * 2)) * HEIGHT
}

function pathFor(
  trace: readonly TracePoint[],
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

function formatVoltage(value: number) {
  const absolute = Math.abs(value)
  const formatted = absolute >= 10 ? absolute.toFixed(0) : absolute.toFixed(1)
  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${formatted}V`
}

export function ScopeWorkspace({
  traceHistory,
  traceRevision,
  probes,
  program,
  inputs,
  outputs,
  focusedProbeIndex,
  onProbeChange,
  onProbeFocus,
}: Props) {
  const [syncEnabled, setSyncEnabled] = useState(true)
  const [triggerProbe, setTriggerProbe] = useState<ScopeTriggerSource>('auto')
  const [triggerEdge, setTriggerEdge] = useState<TriggerEdge>('rising')
  const [triggerLevel, setTriggerLevel] = useState(0)
  const [timeZoomIndex, setTimeZoomIndex] = useState(3)
  const [voltageZoomIndex, setVoltageZoomIndex] = useState(3)
  const [capturedFrame, setCapturedFrame] = useState<CapturedScopeFrame | null>(null)

  const liveTrace = traceHistory.snapshot(traceRevision)
  const trace = capturedFrame?.trace ?? liveTrace
  const displayedInputs = capturedFrame?.inputs ?? inputs
  const displayedOutputs = capturedFrame?.outputs ?? outputs
  const paused = capturedFrame !== null
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
    if (triggerProbe === 'clock') return null
    const source = probes[triggerProbe]?.source
    return source
      ? { source, level: triggerLevel, probeIndex: triggerProbe }
      : null
  }, [automaticTrigger, probes, syncEnabled, triggerLevel, triggerProbe])

  const scopeWindow = useMemo(
    () => triggerProbe === 'clock' && syncEnabled
      ? selectClockScopeWindow(trace, durationSeconds, PRE_TRIGGER_RATIO)
      : selectScopeWindow(
          trace,
          durationSeconds,
          selectedTrigger,
          triggerEdge,
          PRE_TRIGGER_RATIO,
        ),
    [durationSeconds, selectedTrigger, syncEnabled, trace, triggerEdge, triggerProbe],
  )
  const renderPoints = useMemo(
    () => downsampleScopeTrace(
      scopeWindow.points,
      probes.map((probe) => probe.source),
      WIDTH,
    ),
    [probes, scopeWindow.points],
  )

  const triggerStatus = paused
    ? scopeWindow.locked
      ? triggerProbe === 'clock'
        ? 'paused · locked · global clock'
        : `paused · locked · CH ${selectedTrigger ? selectedTrigger.probeIndex + 1 : '-'}`
      : 'paused'
    : !syncEnabled
      ? 'free run'
      : scopeWindow.locked
        ? triggerProbe === 'clock'
          ? 'locked · global clock'
          : `locked · CH ${selectedTrigger ? selectedTrigger.probeIndex + 1 : '-'}`
        : triggerProbe === 'clock'
          ? 'waiting for clock'
          : 'waiting for edge'
  const voltageRange = voltsPerDivision * VERTICAL_DIVISIONS / 2
  const triggerVisible = selectedTrigger
    && selectedTrigger.level >= -voltageRange
    && selectedTrigger.level <= voltageRange

  return (
    <section className="scope-workspace" aria-label="Oscilloscope workspace">
      <div className="scope-controls">
        <ScopeToolbar
          syncEnabled={syncEnabled}
          triggerProbe={triggerProbe}
          triggerEdge={triggerEdge}
          triggerLevel={triggerLevel}
          timeZoomIndex={timeZoomIndex}
          voltageZoomIndex={voltageZoomIndex}
          timeOptions={TIME_PER_DIVISION_MS}
          voltageOptions={VOLTS_PER_DIVISION}
          probes={probes}
          program={program}
          triggerStatus={triggerStatus}
          triggerLocked={scopeWindow.locked}
          onSyncChange={setSyncEnabled}
          onTriggerProbeChange={setTriggerProbe}
          onTriggerEdgeChange={setTriggerEdge}
          onTriggerLevelChange={setTriggerLevel}
          onTimeZoomChange={setTimeZoomIndex}
          onVoltageZoomChange={setVoltageZoomIndex}
        />

        <ScopeLegend
          probes={probes}
          program={program}
          inputs={displayedInputs}
          outputs={displayedOutputs}
          focusedProbeIndex={focusedProbeIndex}
          onProbeChange={onProbeChange}
          onProbeFocus={onProbeFocus}
        />

        <ScopePauseButton
          paused={paused}
          onPausedChange={(nextPaused) => setCapturedFrame(
            nextPaused
              ? captureScopeFrame(liveTrace, inputs, outputs)
              : null,
          )}
        />
      </div>

      <div className="scope-graph">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Synchronized input and output voltage traces"
        >
          <title>Oscilloscope traces</title>
          <desc>
            Ten horizontal time divisions and four vertical voltage divisions.
            {paused ? ' The display is paused on a captured time slice.' : ''}
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

          {probes.map((probe, index) => (
            <path
              className={`scope-path scope-path--${index + 1}${
                focusedProbeIndex === index ? ' is-focused' : ''
              }`}
              d={pathFor(
                renderPoints,
                probe.source,
                scopeWindow.startTime,
                scopeWindow.endTime,
                voltsPerDivision,
              )}
              key={probe.id}
            >
              <title>{scopeSourceLabel(probe.source, program)}</title>
            </path>
          ))}
        </svg>
        <span className="scope-axis-label scope-axis-label--top">
          {formatVoltage(voltageRange)}
        </span>
        <span className="scope-axis-label scope-axis-label--zero">0V</span>
        <span className="scope-axis-label scope-axis-label--bottom">
          {formatVoltage(-voltageRange)}
        </span>
      </div>
    </section>
  )
}
