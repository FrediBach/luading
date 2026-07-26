import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_DISTING_SCRIPT } from './default-script'
import { DistingDisplay } from './DistingDisplay'
import { DistingCodeEditor } from './editor/DistingCodeEditor'
import { DEFAULT_CLOCK } from './emulation/signal-sources'
import { InputPatchBay } from './InputPatchBay'
import { OutputAudioRouter } from './OutputAudioRouter'
import { Scope } from './Scope'
import { ScriptQualityPanel } from './ScriptQualityPanel'
import { DISTING_SCRIPT_EXAMPLES, DISTING_SCRIPT_GROUPS } from './script-examples'
import type {
  DistingHardwareEvent,
  DistingUiControl,
  DrawCommand,
  GlobalClockConfig,
  LoadedProgram,
  RuntimeStats,
  ScopeProbe,
  ScopeSource,
  SignalSourceConfig,
  TracePoint,
  WorkerRequest,
  WorkerResponse,
} from './types'
import {
  calculateQualityReport,
  dedupeDiagnostics,
  runtimePerformanceDiagnostics,
} from './validation/score'
import type {
  ScriptDiagnostic,
  SourceRange,
  ValidationWorkerResponse,
} from './validation/types'
import './DistingPlayground.css'

const MAX_TRACE_POINTS = 5000
const LOAD_TIMEOUT_MS = 2000
const EMPTY_PROBES: ScopeProbe[] = Array.from({ length: 4 }, (_, index) => ({
  id: `probe-${index + 1}`,
  source: null,
}))

const EMPTY_STATS: RuntimeStats = {
  simulatedSeconds: 0,
  steps: 0,
  averageUs: 0,
  p95Us: 0,
  maxUs: 0,
  budgetPercent: 0,
  droppedSteps: 0,
  callbacks: {},
}

function formatDuration(microseconds: number) {
  return microseconds < 1000 ? `${microseconds.toFixed(1)} µs` : `${(microseconds / 1000).toFixed(2)} ms`
}

function parameterLabel(value: number, unit: string) {
  return `${Number.isInteger(value) ? value : value.toFixed(2)}${unit ? ` ${unit}` : ''}`
}

function hardwareEventLabel(event: DistingHardwareEvent) {
  const hex = (value: number) => `0x${value.toString(16).padStart(2, '0').toUpperCase()}`
  if (event.kind === 'i2cCommand') {
    return `I2C ${hex(event.address)} ← ${event.bytes.map(hex).join(' ')}`
  }
  if (event.kind === 'i2cGetter') {
    return `I2C ${hex(event.address)} → ${event.response.map(hex).join(' ')}`
  }
  if (event.kind === 'midiOut') {
    return `MIDI ${hex(event.destinations)} ← ${event.bytes.map(hex).join(' ')}`
  }
  if (event.kind === 'displayMode') return `Display mode: ${event.mode}`
  return 'Custom UI exited'
}

export function DistingPlayground() {
  const [program, setProgram] = useState<LoadedProgram | null>(null)
  const [status, setStatus] = useState<'booting' | 'loading' | 'paused' | 'running' | 'error'>('booting')
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [hardwareEvents, setHardwareEvents] = useState<string[]>([])
  const [inputSources, setInputSources] = useState<SignalSourceConfig[]>([])
  const [inputs, setInputs] = useState<number[]>([])
  const [clock, setClock] = useState<GlobalClockConfig>({ ...DEFAULT_CLOCK })
  const [parameterValues, setParameterValues] = useState<number[]>([])
  const [outputs, setOutputs] = useState<number[]>([])
  const [stats, setStats] = useState<RuntimeStats>(EMPTY_STATS)
  const [trace, setTrace] = useState<TracePoint[]>([])
  const [display, setDisplay] = useState<DrawCommand[]>([])
  const [probes, setProbes] = useState<ScopeProbe[]>(EMPTY_PROBES)
  const [editorSource, setEditorSource] = useState(DEFAULT_DISTING_SCRIPT)
  const [selectedExampleId, setSelectedExampleId] = useState('')
  const [staticDiagnostics, setStaticDiagnostics] = useState<ScriptDiagnostic[]>([])
  const [contractDiagnostics, setContractDiagnostics] = useState<ScriptDiagnostic[]>([])
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<ScriptDiagnostic[]>([])
  const [sourceIsLoaded, setSourceIsLoaded] = useState(false)
  const [revealRequest, setRevealRequest] = useState<{ range: SourceRange; nonce: number }>()
  const [potPositions, setPotPositions] = useState([0.5, 0.5, 0.5])
  const [midiBytes, setMidiBytes] = useState([0x90, 60, 100])
  const [hasSavedState, setHasSavedState] = useState(false)

  const workerRef = useRef<Worker | null>(null)
  const validationWorkerRef = useRef<Worker | null>(null)
  const validationVersionRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sourceRef = useRef(DEFAULT_DISTING_SCRIPT)
  const modulesRef = useRef<Record<string, string>>({})
  const runningRef = useRef(false)
  const resumeWhenVisibleRef = useRef(false)
  const sourceIsLoadedRef = useRef(false)
  const savedStateRef = useRef<unknown>(undefined)

  const post = useCallback((message: WorkerRequest) => {
    workerRef.current?.postMessage(message)
  }, [])

  const updateSource = useCallback((nextSource: string) => {
    sourceRef.current = nextSource
    setEditorSource(nextSource)
    setSelectedExampleId('')
    sourceIsLoadedRef.current = false
    setSourceIsLoaded(false)
    setContractDiagnostics([])
    setRuntimeDiagnostics([])
    savedStateRef.current = undefined
    setHasSavedState(false)
  }, [])

  const clearLoadTimeout = useCallback(() => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }, [])

  const terminateWorker = useCallback(() => {
    clearLoadTimeout()
    workerRef.current?.terminate()
    workerRef.current = null
    runningRef.current = false
  }, [clearLoadTimeout])

  const handleWorkerMessage = useCallback((message: WorkerResponse) => {
    if (message.type === 'ready') {
      workerRef.current?.postMessage({
        type: 'load',
        source: sourceRef.current,
        modules: modulesRef.current,
        state: savedStateRef.current,
      } satisfies WorkerRequest)
      setStatus('loading')
      clearLoadTimeout()
      timeoutRef.current = setTimeout(() => {
        workerRef.current?.terminate()
        workerRef.current = null
        setStatus('error')
        setError(`Script initialization exceeded ${LOAD_TIMEOUT_MS / 1000} seconds. The worker was terminated safely.`)
      }, LOAD_TIMEOUT_MS)
    } else if (message.type === 'loaded') {
      clearLoadTimeout()
      setProgram(message.program)
      setInputSources(message.inputSources)
      setInputs(Array.from({ length: message.program.inputCount }, () => 0))
      setParameterValues(message.program.parameters.map((parameter) => parameter.value))
      setPotPositions(message.program.uiPotPositions.map((value) => value ?? 0.5))
      setOutputs(Array.from({ length: message.program.outputCount }, () => 0))
      setClock({ ...DEFAULT_CLOCK })
      setProbes(EMPTY_PROBES.map((probe, index) => ({
        ...probe,
        source: index === 0 && message.program.inputCount > 0
          ? { kind: 'input', index: 0 }
          : index - 1 < message.program.outputCount
            ? { kind: 'output', index: index - 1 }
            : null,
      })))
      setStatus('paused')
      setError(null)
      sourceIsLoadedRef.current = true
      setSourceIsLoaded(true)
      setContractDiagnostics(message.diagnostics)
      setRuntimeDiagnostics([])
      if (document.hidden) {
        resumeWhenVisibleRef.current = true
      } else {
        workerRef.current?.postMessage({ type: 'start' } satisfies WorkerRequest)
      }
    } else if (message.type === 'running') {
      if (message.running && document.hidden) {
        runningRef.current = false
        resumeWhenVisibleRef.current = true
        workerRef.current?.postMessage({ type: 'pause' } satisfies WorkerRequest)
        setStatus('paused')
        return
      }
      runningRef.current = message.running
      setStatus(message.running ? 'running' : 'paused')
    } else if (message.type === 'frame') {
      setInputs(message.inputs)
      setOutputs(message.outputs)
      setParameterValues(message.parameterValues)
      setStats(message.stats)
      setDisplay(message.display)
      if (message.trace.length > 0) {
        setTrace((previous) => [...previous, ...message.trace].slice(-MAX_TRACE_POINTS))
      }
    } else if (message.type === 'log') {
      setLogs((previous) => [...previous, message.line].slice(-50))
    } else if (message.type === 'hardware') {
      setHardwareEvents((previous) => [...previous, hardwareEventLabel(message.event)].slice(-50))
    } else if (message.type === 'serialised') {
      savedStateRef.current = message.state
      setHasSavedState(true)
    } else if (message.type === 'diagnostics') {
      if (sourceIsLoadedRef.current) {
        setRuntimeDiagnostics((previous) => dedupeDiagnostics([...previous, ...message.diagnostics]))
      }
    } else if (message.type === 'error') {
      clearLoadTimeout()
      runningRef.current = false
      resumeWhenVisibleRef.current = false
      setStatus('error')
      setError(message.message)
      sourceIsLoadedRef.current = false
      setSourceIsLoaded(false)
      if (message.diagnostic) setRuntimeDiagnostics([message.diagnostic])
    }
  }, [clearLoadTimeout])

  const createWorker = useCallback(() => {
    terminateWorker()
    const worker = new Worker(new URL('./disting.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      handleWorkerMessage(event.data)
      if (event.data.type === 'frame') {
        worker.postMessage({ type: 'frameAck' } satisfies WorkerRequest)
      }
    }
    worker.onerror = (event) => {
      clearLoadTimeout()
      setStatus('error')
      setError(event.message || 'The Lua worker stopped unexpectedly.')
    }
  }, [clearLoadTimeout, handleWorkerMessage, terminateWorker])

  const loadScript = useCallback(() => {
    runningRef.current = false
    resumeWhenVisibleRef.current = false
    setProgram(null)
    setTrace([])
    setStats(EMPTY_STATS)
    setDisplay([])
    setInputSources([])
    setInputs([])
    setProbes(EMPTY_PROBES)
    setLogs([])
    setHardwareEvents([])
    setError(null)
    sourceIsLoadedRef.current = false
    setSourceIsLoaded(false)
    setContractDiagnostics([])
    setRuntimeDiagnostics([])
    setStatus('loading')
    createWorker()
  }, [createWorker])

  const selectExample = (exampleId: string) => {
    const example = DISTING_SCRIPT_EXAMPLES.get(exampleId)
    if (!example) return

    sourceRef.current = example.source
    modulesRef.current = example.modules
    setEditorSource(example.source)
    setSelectedExampleId(example.id)
    savedStateRef.current = undefined
    setHasSavedState(false)
    sourceIsLoadedRef.current = false
    setSourceIsLoaded(false)
    loadScript()
  }

  useEffect(() => {
    createWorker()
    return terminateWorker
  }, [createWorker, terminateWorker])

  useEffect(() => {
    const validationWorker = new Worker(new URL('./validation.worker.ts', import.meta.url), { type: 'module' })
    validationWorkerRef.current = validationWorker
    validationWorker.onmessage = (event: MessageEvent<ValidationWorkerResponse>) => {
      if (event.data.type !== 'validated' || event.data.version !== validationVersionRef.current) return
      setStaticDiagnostics(event.data.diagnostics)
    }
    return () => {
      validationWorker.terminate()
      validationWorkerRef.current = null
    }
  }, [])

  useEffect(() => {
    const version = validationVersionRef.current + 1
    validationVersionRef.current = version
    const timeout = window.setTimeout(() => {
      validationWorkerRef.current?.postMessage({
        type: 'validate',
        source: editorSource,
        version,
      })
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [editorSource])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (runningRef.current) {
          resumeWhenVisibleRef.current = true
          runningRef.current = false
          post({ type: 'pause' })
        }
        return
      }

      if (!resumeWhenVisibleRef.current) return
      resumeWhenVisibleRef.current = false
      setTrace([])
      setStats(EMPTY_STATS)
      post({ type: 'resetTelemetry' })
      post({ type: 'start' })
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [post])

  const toggleRunning = () => {
    resumeWhenVisibleRef.current = false
    post({ type: status === 'running' ? 'pause' : 'start' })
  }

  const changeInputSource = (index: number, config: SignalSourceConfig) => {
    setInputSources((previous) => previous.map((source, sourceIndex) => (
      sourceIndex === index ? config : source
    )))
    setTrace([])
    post({ type: 'setInputSource', index, config })
  }

  const changeClock = (nextClock: GlobalClockConfig) => {
    setClock(nextClock)
    setTrace([])
    post({ type: 'setClock', config: nextClock })
  }

  const changeParameter = (index: number, value: number) => {
    setParameterValues((previous) => previous.map((item, itemIndex) => itemIndex === index ? value : item))
    setTrace([])
    post({ type: 'setParameter', index, value })
  }

  const turnPot = (index: number, value: number) => {
    setPotPositions((previous) => previous.map((position, positionIndex) => (
      positionIndex === index ? value : position
    )))
    post({
      type: 'uiEvent',
      control: `pot${index + 1}` as DistingUiControl,
      event: 'turn',
      value,
    })
  }

  const turnEncoder = (index: 1 | 2, value: -1 | 1) => {
    post({ type: 'uiEvent', control: `encoder${index}`, event: 'turn', value })
  }

  const pressControl = (control: DistingUiControl) => {
    post({ type: 'uiEvent', control, event: 'push' })
    post({ type: 'uiEvent', control, event: 'release' })
  }

  const sendMidi = () => {
    post({ type: 'midi', bytes: midiBytes })
  }

  const changeProbe = (index: number, source: ScopeSource | null) => {
    setProbes((previous) => previous.map((probe, probeIndex) => (
      probeIndex === index ? { ...probe, source } : probe
    )))
  }

  const budgetState = stats.budgetPercent < 25 ? 'comfortable' : stats.budgetPercent < 75 ? 'watch' : 'over'
  const diagnostics = useMemo(() => dedupeDiagnostics([
    ...staticDiagnostics,
    ...contractDiagnostics,
    ...runtimeDiagnostics,
    ...runtimePerformanceDiagnostics(stats),
  ]), [contractDiagnostics, runtimeDiagnostics, staticDiagnostics, stats])
  const qualityReport = useMemo(
    () => calculateQualityReport(diagnostics, stats, sourceIsLoaded),
    [diagnostics, sourceIsLoaded, stats],
  )

  const selectDiagnostic = (diagnostic: ScriptDiagnostic) => {
    if (!diagnostic.range) return
    setRevealRequest({ range: diagnostic.range, nonce: Date.now() })
  }

  return (
    <main className="disting-app">
      <header className="disting-topbar">
        <span className="disting-project">Luading</span>
        <div className="disting-brand">
          <span className="disting-brand-mark">NT</span>
          <span>Disting NT <small>Lua Simulator</small></span>
        </div>
        <div className={`disting-status disting-status--${status}`}>
          <span />
          {status}
        </div>
      </header>

      <section className="disting-intro">
        <div>
          <p className="disting-eyebrow">Disting-style runtime in your browser</p>
          <h1>Patch the script. Watch the machine.</h1>
          <p>
            A focused simulation of the real Lua lifecycle: one persistent Lua 5.4 VM,
            1 ms control steps, 30 fps drawing, CV, triggers, parameters, and deadline telemetry.
          </p>
        </div>
        <div className="disting-runtime-strip">
          <span>Lua 5.4 / WASM</span>
          <span>1 kHz step</span>
          <span>30 fps draw</span>
          <span>isolated worker</span>
        </div>
      </section>

      <section className="disting-workbench">
        <div className="disting-editor-panel">
          <div className="disting-panel-header">
            <div>
              <span className="disting-panel-kicker">PROGRAM</span>
              <strong>{program?.name ?? 'Lua script'}</strong>
            </div>
            <div className="disting-actions">
              <span className={`disting-quality-chip disting-quality-chip--${qualityReport.status}`}>
                {qualityReport.score === null
                  ? qualityReport.status === 'invalid'
                    ? `${qualityReport.errorCount} errors`
                    : 'Run to score'
                  : `${qualityReport.score} · ${qualityReport.grade}`}
              </span>
              <label className="disting-example-picker">
                <span>Example</span>
                <select
                  aria-label="Lua example script"
                  value={selectedExampleId}
                  onChange={(event) => selectExample(event.target.value)}
                >
                  <option value="" disabled>Choose a script…</option>
                  {DISTING_SCRIPT_GROUPS.map((group) => (
                    <optgroup key={group.name} label={group.name}>
                      {group.examples.map((example) => (
                        <option key={example.id} value={example.id}>{example.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <button type="button" className="disting-button disting-button--secondary" onClick={toggleRunning} disabled={!program}>
                {status === 'running' ? 'Pause' : 'Resume'}
              </button>
              <button type="button" className="disting-button disting-button--primary" onClick={loadScript}>
                Run script
              </button>
            </div>
          </div>
          <DistingCodeEditor
            value={editorSource}
            diagnostics={diagnostics}
            revealRequest={revealRequest}
            onChange={updateSource}
            onRun={loadScript}
          />
          <ScriptQualityPanel
            diagnostics={diagnostics}
            report={qualityReport}
            onSelectDiagnostic={selectDiagnostic}
          />
        </div>

        <div className="disting-device-panel">
          <div className="disting-device-head">
            <div>
              <span className="disting-panel-kicker">SIMULATED MODULE</span>
              <strong>disting NT</strong>
            </div>
            <span className="disting-clock">{stats.simulatedSeconds.toFixed(3)} s</span>
          </div>

          <DistingDisplay commands={display} />

          {program && (
            <div className="disting-hardware-controls">
              <div className="disting-hardware-heading">
                <span>{program.customUi ? 'CUSTOM UI' : 'STANDARD UI'}</span>
                <button type="button" onClick={() => post({ type: 'serialise' })}>
                  {hasSavedState ? 'State saved' : 'Save state'}
                </button>
              </div>

              <div className="disting-pot-bank">
                {potPositions.map((position, index) => (
                  <label key={`pot-${index + 1}`}>
                    <span>Pot {index + 1}</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.001}
                      value={position}
                      onChange={(event) => turnPot(index, Number(event.target.value))}
                    />
                    <button
                      type="button"
                      onClick={() => pressControl(`pot${index + 1}` as DistingUiControl)}
                    >
                      Push
                    </button>
                  </label>
                ))}
              </div>

              <div className="disting-button-bank">
                {[1, 2].map((index) => (
                  <div key={`encoder-${index}`}>
                    <span>Encoder {index}</span>
                    <button type="button" onClick={() => turnEncoder(index as 1 | 2, -1)}>−</button>
                    <button type="button" onClick={() => pressControl(`encoder${index}` as DistingUiControl)}>Push</button>
                    <button type="button" onClick={() => turnEncoder(index as 1 | 2, 1)}>+</button>
                  </div>
                ))}
                <div>
                  <span>Buttons</span>
                  {[1, 2, 3, 4].map((index) => (
                    <button
                      type="button"
                      key={`button-${index}`}
                      onClick={() => pressControl(`button${index}` as DistingUiControl)}
                    >
                      {index}
                    </button>
                  ))}
                </div>
              </div>

              {program.midi && (
                <div className="disting-midi-input">
                  <span>MIDI IN</span>
                  {midiBytes.map((value, index) => (
                    <input
                      key={`midi-byte-${index}`}
                      aria-label={`MIDI byte ${index + 1}`}
                      type="number"
                      min={0}
                      max={255}
                      value={value}
                      onChange={(event) => {
                        const nextValue = Math.min(255, Math.max(0, Number(event.target.value)))
                        setMidiBytes((previous) => previous.map((byte, byteIndex) => (
                          byteIndex === index ? nextValue : byte
                        )))
                      }}
                    />
                  ))}
                  <button type="button" onClick={sendMidi}>Send</button>
                </div>
              )}
            </div>
          )}

          {program && program.parameters.length > 0 && (
            <div className="disting-parameters">
              {program.parameters.map((parameter, index) => (
                <label className="disting-control" key={`${parameter.name}-${index}`}>
                  <span>
                    {parameter.name}
                    <output>{parameter.enumValues?.[Math.round(parameterValues[index]) - 1] ?? parameterLabel(parameterValues[index], parameter.unit)}</output>
                  </span>
                  <input
                    type="range"
                    min={parameter.min}
                    max={parameter.max}
                    step={parameter.enumValues ? 1 : (parameter.max - parameter.min) / 200}
                    value={parameterValues[index]}
                    onChange={(event) => changeParameter(index, Number(event.target.value))}
                  />
                </label>
              ))}
            </div>
          )}

          <div className="disting-output-row">
            {outputs.map((output, index) => (
              <div className="disting-output" key={program?.outputNames[index] ?? index}>
                <span>OUT {index + 1}</span>
                <strong>{output.toFixed(3)} V</strong>
                <small>
                  {program?.outputNames[index] ?? `Output ${index + 1}`}
                  {program ? ` · ${program.outputKinds[index]}` : ''}
                </small>
              </div>
            ))}
          </div>
        </div>
      </section>

      {program && (
        <InputPatchBay
          program={program}
          sources={inputSources}
          values={inputs}
          clock={clock}
          onClockChange={changeClock}
          onSourceChange={changeInputSource}
          onTrigger={(index) => post({ type: 'trigger', index })}
        />
      )}

      <OutputAudioRouter program={program} trace={trace} />

      <Scope
        trace={trace}
        probes={probes}
        program={program}
        inputs={inputs}
        outputs={outputs}
        onProbeChange={changeProbe}
      />

      <section className="disting-metrics" aria-label="Runtime performance">
        <div>
          <span>Average step</span>
          <strong>{formatDuration(stats.averageUs)}</strong>
          <small>Lua callback + boundary</small>
        </div>
        <div>
          <span>95th percentile</span>
          <strong>{formatDuration(stats.p95Us)}</strong>
          <small>last 2,000 steps</small>
        </div>
        <div>
          <span>Worst step</span>
          <strong>{formatDuration(stats.maxUs)}</strong>
          <small>{stats.droppedSteps} catch-up drops</small>
        </div>
        <div className={`disting-budget disting-budget--${budgetState}`}>
          <span>Local 1 ms budget</span>
          <strong>{stats.budgetPercent.toFixed(2)}%</strong>
          <small>not calibrated to hardware</small>
        </div>
      </section>

      {(error || logs.length > 0 || hardwareEvents.length > 0) && (
        <section className={`disting-console${error ? ' disting-console--error' : ''}`}>
          <div className="disting-panel-kicker">{error ? 'RUNTIME ERROR' : 'LUA / HARDWARE EVENT LOG'}</div>
          <pre>{error ?? [...logs, ...hardwareEvents].join('\n')}</pre>
        </section>
      )}
    </main>
  )
}
