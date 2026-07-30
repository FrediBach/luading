import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { DEFAULT_DISTING_SCRIPT } from './default-script'
import { DistingDeviceFace, ParameterBank } from './device'
import { createUiEventRequest } from './device/hardware-controls'
import { DistingCodeEditor } from './editor/DistingCodeEditor'
import { DEFAULT_CLOCK } from './emulation/signal-sources'
import {
  ConsoleWorkspace,
  PerformanceWorkspace,
  ProblemsWorkspace,
  ScopeWorkspace,
} from './drawer'
import {
  blockingDrawerTab,
  boundConsoleEntries,
  diagnosticRevealRequest,
  type BlockingState,
  type ConsoleEntry,
  type ConsoleEntryKind,
} from './drawer/drawer-workspaces'
import {
  assignScopeSource,
  createDefaultScopeProbes,
} from './drawer/scope-controls'
import { IoDeck } from './io'
import { DISTING_SCRIPT_EXAMPLES, DISTING_SCRIPT_GROUPS } from './script-examples'
import { BottomDrawer } from './workbench/BottomDrawer'
import { CommandBar } from './workbench/CommandBar'
import { InstrumentRack } from './workbench/InstrumentRack'
import { SplitPane } from './workbench/SplitPane'
import { StatusBar } from './workbench/StatusBar'
import { useWorkbenchLayout } from './workbench/useWorkbenchLayout'
import { WorkbenchShell } from './workbench/WorkbenchShell'
import type {
  DistingHardwareEvent,
  DistingUiControl,
  DistingUiEventKind,
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
  runtimePerformanceDiagnosticKey,
  runtimePerformanceDiagnosticsForKey,
} from './validation/score'
import type {
  ScriptDiagnostic,
  SourceRange,
  ValidationWorkerResponse,
} from './validation/types'
import './DistingPlayground.css'
import './controls/controls.css'
import './device/device.css'
import './workbench/workbench.css'
import './io/io.css'

const MAX_TRACE_POINTS = 5000
const LOAD_TIMEOUT_MS = 2000
const EMPTY_PROBES: ScopeProbe[] = createDefaultScopeProbes(0, 0)

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

function hardwareEventEntry(event: DistingHardwareEvent): {
  kind: ConsoleEntryKind
  message: string
} {
  const hex = (value: number) => `0x${value.toString(16).padStart(2, '0').toUpperCase()}`
  if (event.kind === 'i2cCommand') {
    return {
      kind: 'i2c',
      message: `${hex(event.address)} ← ${event.bytes.map(hex).join(' ')}`,
    }
  }
  if (event.kind === 'i2cGetter') {
    return {
      kind: 'i2c',
      message: `${hex(event.address)} → ${event.response.map(hex).join(' ')}`,
    }
  }
  if (event.kind === 'midiOut') {
    return {
      kind: 'midi',
      message: `${hex(event.destinations)} ← ${event.bytes.map(hex).join(' ')}`,
    }
  }
  if (event.kind === 'displayMode') {
    return { kind: 'display', message: `Mode: ${event.mode}` }
  }
  return { kind: 'display', message: 'Custom UI exited' }
}

export function DistingPlayground() {
  const { layout, dispatch: dispatchLayout } = useWorkbenchLayout()
  const [program, setProgram] = useState<LoadedProgram | null>(null)
  const [status, setStatus] = useState<'booting' | 'loading' | 'paused' | 'running' | 'error'>('booting')
  const [error, setError] = useState<string | null>(null)
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([])
  const [inputSources, setInputSources] = useState<SignalSourceConfig[]>([])
  const [inputs, setInputs] = useState<number[]>([])
  const [clock, setClock] = useState<GlobalClockConfig>({ ...DEFAULT_CLOCK })
  const [parameterValues, setParameterValues] = useState<number[]>([])
  const [outputs, setOutputs] = useState<number[]>([])
  const [stats, setStats] = useState<RuntimeStats>(EMPTY_STATS)
  const [trace, setTrace] = useState<TracePoint[]>([])
  const [display, setDisplay] = useState<DrawCommand[]>([])
  const [probes, setProbes] = useState<ScopeProbe[]>(EMPTY_PROBES)
  const [focusedScopeProbe, setFocusedScopeProbe] = useState<number | null>(null)
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
  const consoleEntryIdRef = useRef(0)
  const blockingStateRef = useRef<BlockingState>({
    runtimeError: null,
    diagnosticErrorCount: 0,
  })

  const appendConsoleEntry = useCallback((
    kind: ConsoleEntryKind,
    message: string,
  ) => {
    consoleEntryIdRef.current += 1
    const entry = {
      id: consoleEntryIdRef.current,
      kind,
      message,
    } satisfies ConsoleEntry
    setConsoleEntries((previous) => boundConsoleEntries([...previous, entry]))
  }, [])

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
        const message = `Script initialization exceeded ${LOAD_TIMEOUT_MS / 1000} seconds. The worker was terminated safely.`
        setError(message)
        appendConsoleEntry('error', message)
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
      const defaultProbes = createDefaultScopeProbes(
        message.program.inputCount,
        message.program.outputCount,
      )
      setProbes(defaultProbes)
      setFocusedScopeProbe(
        defaultProbes.findIndex((probe) => probe.source !== null) >= 0
          ? defaultProbes.findIndex((probe) => probe.source !== null)
          : null,
      )
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
      startTransition(() => {
        setInputs(message.inputs)
        setOutputs(message.outputs)
        setParameterValues(message.parameterValues)
        setStats(message.stats)
        setDisplay(message.display)
        if (message.trace.length > 0) {
          setTrace((previous) => [...previous, ...message.trace].slice(-MAX_TRACE_POINTS))
        }
      })
    } else if (message.type === 'log') {
      appendConsoleEntry('lua', message.line)
    } else if (message.type === 'hardware') {
      const entry = hardwareEventEntry(message.event)
      appendConsoleEntry(entry.kind, entry.message)
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
      appendConsoleEntry('error', message.message)
      sourceIsLoadedRef.current = false
      setSourceIsLoaded(false)
      if (message.diagnostic) setRuntimeDiagnostics([message.diagnostic])
    }
  }, [appendConsoleEntry, clearLoadTimeout])

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
      const message = event.message || 'The Lua worker stopped unexpectedly.'
      setStatus('error')
      setError(message)
      appendConsoleEntry('error', message)
    }
  }, [appendConsoleEntry, clearLoadTimeout, handleWorkerMessage, terminateWorker])

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
    setFocusedScopeProbe(null)
    setConsoleEntries([])
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
    post(createUiEventRequest(
      `pot${index + 1}` as DistingUiControl,
      'turn',
      value,
    ))
  }

  const turnEncoder = (index: 0 | 1, value: -1 | 1) => {
    post(createUiEventRequest(
      `encoder${index + 1}` as DistingUiControl,
      'turn',
      value,
    ))
  }

  const sendControlEvent = (
    control: DistingUiControl,
    event: Extract<DistingUiEventKind, 'push' | 'release'>,
  ) => {
    post(createUiEventRequest(control, event))
  }

  const sendMidi = () => {
    post({ type: 'midi', bytes: midiBytes })
  }

  const changeProbe = (index: number, source: ScopeSource | null) => {
    setProbes((previous) => assignScopeSource(previous, index, source))
  }

  const focusProbe = (index: number) => {
    setFocusedScopeProbe(index)
    dispatchLayout({ type: 'openDrawer', tab: 'scope' })
  }

  const performanceDiagnosticKey = runtimePerformanceDiagnosticKey(stats)
  const performanceDiagnostics = useMemo(
    () => runtimePerformanceDiagnosticsForKey(performanceDiagnosticKey),
    [performanceDiagnosticKey],
  )
  const diagnostics = useMemo(() => dedupeDiagnostics([
    ...staticDiagnostics,
    ...contractDiagnostics,
    ...runtimeDiagnostics,
    ...performanceDiagnostics,
  ]), [
    contractDiagnostics,
    performanceDiagnostics,
    runtimeDiagnostics,
    staticDiagnostics,
  ])
  const qualityReport = useMemo(
    () => calculateQualityReport(diagnostics, stats, sourceIsLoaded),
    [diagnostics, sourceIsLoaded, stats],
  )
  const qualityLabel = qualityReport.score === null
    ? qualityReport.status === 'invalid'
      ? `${qualityReport.errorCount} errors`
      : 'Run to score'
    : `${qualityReport.score} · ${qualityReport.grade}`

  useEffect(() => {
    const current = {
      runtimeError: error,
      diagnosticErrorCount: qualityReport.errorCount,
    } satisfies BlockingState
    const tab = blockingDrawerTab(blockingStateRef.current, current)
    blockingStateRef.current = current
    if (tab) dispatchLayout({ type: 'openDrawer', tab })
  }, [dispatchLayout, error, qualityReport.errorCount])

  const selectDiagnostic = (diagnostic: ScriptDiagnostic) => {
    const request = diagnosticRevealRequest(diagnostic, Date.now())
    if (request) setRevealRequest(request)
  }

  return (
    <WorkbenchShell
      density={layout.density}
      commandBar={(
        <CommandBar
          programName={program?.name ?? 'Lua script'}
          selectedExampleId={selectedExampleId}
          scriptGroups={DISTING_SCRIPT_GROUPS}
          status={status}
          qualityLabel={qualityLabel}
          qualityStatus={qualityReport.status}
          qualityErrorCount={qualityReport.errorCount}
          qualityWarningCount={qualityReport.warningCount}
          canToggleRunning={Boolean(program)}
          onSelectExample={selectExample}
          onToggleRunning={toggleRunning}
          onRun={loadScript}
          onOpenProblems={() => dispatchLayout({ type: 'openDrawer', tab: 'problems' })}
        />
      )}
      workspace={(
        <SplitPane
          splitPercent={layout.splitPercent}
          onSplitChange={(value) => dispatchLayout({ type: 'setSplit', value })}
          onSplitReset={() => dispatchLayout({ type: 'resetSplit' })}
          primary={(
            <div className="disting-editor-panel workbench-editor">
              <div className="workbench-editor-heading">
                <span className="disting-panel-kicker">PROGRAM</span>
                <strong>{program?.name ?? 'Lua script'}</strong>
              </div>
              <DistingCodeEditor
                value={editorSource}
                diagnostics={diagnostics}
                revealRequest={revealRequest}
                onChange={updateSource}
                onRun={loadScript}
              />
            </div>
          )}
          secondary={(
            <InstrumentRack>
              <div className="disting-device-panel">
                <DistingDeviceFace
                  commands={display}
                  programName={program?.name ?? 'Lua script'}
                  customUi={program?.customUi ?? null}
                  simulatedSeconds={stats.simulatedSeconds}
                  potPositions={potPositions}
                  savedState={hasSavedState}
                  onSaveState={() => post({ type: 'serialise' })}
                  onPotTurn={turnPot}
                  onEncoderTurn={turnEncoder}
                  onControlPress={(control) => sendControlEvent(control, 'push')}
                  onControlRelease={(control) => sendControlEvent(control, 'release')}
                  utilities={program?.midi ? (
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
                  ) : undefined}
                />

                {program && (
                  <ParameterBank
                    definitions={program.parameters}
                    values={parameterValues}
                    onChange={changeParameter}
                  />
                )}

              </div>

              {program && (
                <IoDeck
                  program={program}
                  sources={inputSources}
                  values={inputs}
                  outputs={outputs}
                  probes={probes}
                  focusedScopeProbe={focusedScopeProbe}
                  trace={trace}
                  clock={clock}
                  onClockChange={changeClock}
                  onSourceChange={changeInputSource}
                  onTrigger={(index) => post({ type: 'trigger', index })}
                  onProbeChange={changeProbe}
                  onProbeFocus={focusProbe}
                />
              )}
            </InstrumentRack>
          )}
        />
      )}
      drawer={(
        <BottomDrawer
          activeTab={layout.activeDrawerTab}
          open={layout.drawerOpen}
          height={layout.drawerHeight}
          onToggleTab={(tab) => dispatchLayout({ type: 'toggleDrawer', tab })}
          onHeightChange={(value) => dispatchLayout({ type: 'setDrawerHeight', value })}
          tabs={[
            {
              id: 'scope',
              label: 'Scope',
              content: (
                <ScopeWorkspace
                  trace={trace}
                  probes={probes}
                  program={program}
                  inputs={inputs}
                  outputs={outputs}
                  focusedProbeIndex={focusedScopeProbe}
                  onProbeChange={changeProbe}
                  onProbeFocus={setFocusedScopeProbe}
                />
              ),
            },
            {
              id: 'problems',
              label: 'Problems',
              badge: diagnostics.length,
              content: (
                <ProblemsWorkspace
                  diagnostics={diagnostics}
                  report={qualityReport}
                  onSelectDiagnostic={selectDiagnostic}
                />
              ),
            },
            {
              id: 'console',
              label: 'Console',
              badge: consoleEntries.length,
              content: (
                <ConsoleWorkspace
                  entries={consoleEntries}
                  onClear={() => setConsoleEntries([])}
                />
              ),
            },
            {
              id: 'performance',
              label: 'Performance',
              content: (
                <PerformanceWorkspace stats={stats} />
              ),
            },
          ]}
        />
      )}
      statusBar={<StatusBar stats={stats} />}
    />
  )
}
