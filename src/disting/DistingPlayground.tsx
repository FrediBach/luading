import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { DEFAULT_DISTING_SCRIPT } from './default-script'
import {
  DistingDeviceFace,
  DraggableDisplayPreview,
  ParameterBank,
} from './device'
import {
  createUiEventRequest,
  hardwareControlsForCallbacks,
} from './device/hardware-controls'
import { DistingCodeEditor } from './editor/DistingCodeEditor'
import { DEFAULT_CLOCK } from './emulation/signal-sources'
import { TraceHistory } from './emulation/trace-history'
import {
  assignedWebMidiOutputIds,
  initialWebMidiInputValue,
  WebMidiInputRouter,
} from './emulation/midi-routing'
import { DistingWebMidiManager } from './emulation/web-midi'
import { FrameCommitGate } from './frame-commit'
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
import {
  browserThemeStorage,
  persistTheme,
  storedTheme,
  toggledTheme,
} from './theme'
import { persistTextSize, storedTextSize, type TextSize } from './appearance'
import { BottomDrawer } from './workbench/BottomDrawer'
import { CommandBar } from './workbench/CommandBar'
import { InstrumentRack } from './workbench/InstrumentRack'
import { SplitPane } from './workbench/SplitPane'
import { StatusBar } from './workbench/StatusBar'
import { useWorkbenchLayout } from './workbench/useWorkbenchLayout'
import { WorkbenchShell } from './workbench/WorkbenchShell'
import { useWorkbenchShortcuts } from './workbench/workbench-shortcuts'
import {
  resolveWorkbenchDensity,
  useWorkbenchViewport,
} from './workbench/useWorkbenchViewport'
import { createMidiEventRequest } from './workbench/midi-event'
import {
  createLuaScriptDownload,
  luaDownloadFilename,
  readLuaScriptFile,
} from './workbench/script-file'
import {
  generateScriptScaffold,
  type ScriptScaffoldDraft,
} from './workbench/script-scaffold'
import { useProjectLibrary } from './workbench/useProjectLibrary'
import type { ProjectTemplate } from './workbench/projects'
import type {
  DistingHardwareEvent,
  DistingMidiDestination,
  DistingMidiPortAssignments,
  DistingUiControl,
  DistingUiEventKind,
  DrawCommand,
  GlobalClockConfig,
  InputChannelRoute,
  LoadedProgram,
  RuntimeStats,
  ScopeProbe,
  ScopeSource,
  WebMidiDeviceState,
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
import {
  clearOutdatedSyntaxDiagnostics,
  isCurrentValidationResponse,
} from './validation/worker-protocol'
import {
  resolveDiagnosticLocations,
  type LuaSourceIndex,
} from './validation/source-index'
import './DistingPlayground.css'
import './controls/controls.css'
import './device/device.css'
import './workbench/workbench.css'
import './io/io.css'

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

const DEFAULT_PROJECT_TEMPLATE: ProjectTemplate = {
  id: 'luading/default-vector-lfo',
  filename: 'Vector LFO.lua',
  source: DEFAULT_DISTING_SCRIPT,
  modules: {},
}

const PROJECT_TEMPLATES = new Map<string, ProjectTemplate>([
  [DEFAULT_PROJECT_TEMPLATE.id, DEFAULT_PROJECT_TEMPLATE],
  ...[...DISTING_SCRIPT_EXAMPLES.values()].map((example): [string, ProjectTemplate] => [
    example.id,
    {
      id: example.id,
      filename: luaDownloadFilename(example.id.split('/').at(-1) ?? example.name),
      source: example.source,
      modules: example.modules,
    },
  ]),
])

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
  const { narrow, touchOriented } = useWorkbenchViewport()
  const [program, setProgram] = useState<LoadedProgram | null>(null)
  const [status, setStatus] = useState<'booting' | 'loading' | 'paused' | 'running' | 'error'>('booting')
  const [error, setError] = useState<string | null>(null)
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([])
  const [inputRoutes, setInputRoutes] = useState<InputChannelRoute[]>([])
  const [inputs, setInputs] = useState<number[]>([])
  const [clock, setClock] = useState<GlobalClockConfig>({ ...DEFAULT_CLOCK })
  const [parameterValues, setParameterValues] = useState<number[]>([])
  const [outputs, setOutputs] = useState<number[]>([])
  const [stats, setStats] = useState<RuntimeStats>(EMPTY_STATS)
  const [traceHistory] = useState(() => new TraceHistory())
  const [traceRevision, setTraceRevision] = useState(0)
  const [display, setDisplay] = useState<DrawCommand[]>([])
  const [probes, setProbes] = useState<ScopeProbe[]>(EMPTY_PROBES)
  const [focusedScopeProbe, setFocusedScopeProbe] = useState<number | null>(null)
  const [editorSource, setEditorSource] = useState(DEFAULT_DISTING_SCRIPT)
  const [staticDiagnostics, setStaticDiagnostics] = useState<ScriptDiagnostic[]>([])
  const [contractDiagnostics, setContractDiagnostics] = useState<ScriptDiagnostic[]>([])
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<ScriptDiagnostic[]>([])
  const [sourceIndex, setSourceIndex] = useState<LuaSourceIndex | null>(null)
  const [sourceVersion, setSourceVersion] = useState(1)
  const [sourceIsLoaded, setSourceIsLoaded] = useState(false)
  const [revealRequest, setRevealRequest] = useState<{ range: SourceRange; nonce: number }>()
  const [potPositions, setPotPositions] = useState([0.5, 0.5, 0.5])
  const [midiBytes, setMidiBytes] = useState([0x90, 60, 100])
  const [webMidiManager] = useState(() => new DistingWebMidiManager())
  const [webMidiState, setWebMidiState] = useState<WebMidiDeviceState>(() => (
    webMidiManager.state
  ))
  const [midiPortAssignments, setMidiPortAssignments] = useState<DistingMidiPortAssignments>({})
  const [directMidiInputIds, setDirectMidiInputIds] = useState<string[]>([])
  const [hasSavedState, setHasSavedState] = useState(false)
  const [committedFrameRevision, setCommittedFrameRevision] = useState(0)
  const [theme, setTheme] = useState(() => storedTheme(browserThemeStorage()))
  const [textSize, setTextSize] = useState<TextSize>(() => (
    storedTextSize(browserThemeStorage())
  ))
  const [fileError, setFileError] = useState<string | null>(null)
  const projectLibrary = useProjectLibrary({
    templates: PROJECT_TEMPLATES,
    defaultTemplate: DEFAULT_PROJECT_TEMPLATE,
    confirmDiscard: (message) => window.confirm(message),
  })
  const activeProjectDocumentRef = useRef(projectLibrary.active)
  activeProjectDocumentRef.current = projectLibrary.active
  const selectedExampleId = projectLibrary.active.ref.kind === 'bundled'
    && DISTING_SCRIPT_EXAMPLES.has(projectLibrary.active.ref.exampleId)
    ? projectLibrary.active.ref.exampleId
    : ''
  const activeProjectId = projectLibrary.active.ref.kind === 'project'
    ? projectLibrary.active.ref.projectId
    : undefined

  const workerRef = useRef<Worker | null>(null)
  const frameCommitGateRef = useRef(new FrameCommitGate<Worker>())
  const validationWorkerRef = useRef<Worker | null>(null)
  const validationVersionRef = useRef(1)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sourceRef = useRef(DEFAULT_DISTING_SCRIPT)
  const modulesRef = useRef<Record<string, string>>({})
  const runningRef = useRef(false)
  const resumeWhenVisibleRef = useRef(false)
  const sourceIsLoadedRef = useRef(false)
  const savedStateRef = useRef<unknown>(undefined)
  const consoleEntryIdRef = useRef(0)
  const midiPortAssignmentsRef = useRef<DistingMidiPortAssignments>({})
  const directMidiInputIdsRef = useRef(new Set<string>())
  const midiInputRouterRef = useRef(new WebMidiInputRouter())
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
    const nextVersion = validationVersionRef.current + 1
    validationVersionRef.current = nextVersion
    setSourceVersion(nextVersion)
    sourceRef.current = nextSource
    setEditorSource(nextSource)
    projectLibrary.editSource(nextSource)
    setSourceIndex(null)
    setStaticDiagnostics(clearOutdatedSyntaxDiagnostics)
    sourceIsLoadedRef.current = false
    setSourceIsLoaded(false)
    setContractDiagnostics([])
    setRuntimeDiagnostics([])
    savedStateRef.current = undefined
    setHasSavedState(false)
  }, [projectLibrary])

  const clearLoadTimeout = useCallback(() => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }, [])

  const clearTrace = useCallback(() => {
    traceHistory.clear()
    setTraceRevision((revision) => revision + 1)
  }, [traceHistory])

  const terminateWorker = useCallback(() => {
    clearLoadTimeout()
    frameCommitGateRef.current.clear()
    workerRef.current?.terminate()
    workerRef.current = null
    runningRef.current = false
  }, [clearLoadTimeout])

  const handleWorkerMessage = useCallback((message: WorkerResponse, worker: Worker) => {
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
      const routes = message.inputSources.map((source) => ({
        kind: 'generator' as const,
        source,
      }))
      midiInputRouterRef.current.configure(routes.map(() => null))
      setInputRoutes(routes)
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
      const revision = frameCommitGateRef.current.schedule(worker)
      startTransition(() => {
        setInputs(message.inputs)
        setOutputs(message.outputs)
        setParameterValues(message.parameterValues)
        setStats(message.stats)
        setDisplay(message.display)
        if (message.trace.length > 0) {
          traceHistory.append(message.trace)
          setTraceRevision((current) => current + 1)
        }
        setCommittedFrameRevision(revision)
      })
    } else if (message.type === 'log') {
      appendConsoleEntry('lua', message.line)
    } else if (message.type === 'hardware') {
      const entry = hardwareEventEntry(message.event)
      appendConsoleEntry(entry.kind, entry.message)
      if (message.event.kind === 'midiOut') {
        const portIds = assignedWebMidiOutputIds(
          message.event.destinations,
          midiPortAssignmentsRef.current,
        )
        const failures = webMidiManager.send(portIds, message.event.bytes)
        for (const failure of failures) {
          appendConsoleEntry(
            'error',
            `Web MIDI ${failure.portId}: ${failure.message}`,
          )
        }
      }
    } else if (message.type === 'serialised') {
      savedStateRef.current = message.state
      setHasSavedState(true)
    } else if (message.type === 'parameterPresetApplied') {
      setParameterValues(message.parameterValues)
      setDisplay(message.display)
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
      if (message.diagnostics) setContractDiagnostics(message.diagnostics)
      if (message.diagnostic) setRuntimeDiagnostics([message.diagnostic])
    }
  }, [appendConsoleEntry, clearLoadTimeout, traceHistory, webMidiManager])

  const createWorker = useCallback(() => {
    terminateWorker()
    const worker = new Worker(new URL('./disting.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (worker !== workerRef.current) return
      handleWorkerMessage(event.data, worker)
    }
    worker.onerror = (event) => {
      clearLoadTimeout()
      const message = event.message || 'The Lua worker stopped unexpectedly.'
      setStatus('error')
      setError(message)
      appendConsoleEntry('error', message)
    }
  }, [appendConsoleEntry, clearLoadTimeout, handleWorkerMessage, terminateWorker])

  useLayoutEffect(() => {
    const worker = frameCommitGateRef.current.commit(
      committedFrameRevision,
      workerRef.current,
    )
    worker?.postMessage({ type: 'frameAck' } satisfies WorkerRequest)
  }, [committedFrameRevision])

  const loadScript = useCallback(() => {
    runningRef.current = false
    resumeWhenVisibleRef.current = false
    setProgram(null)
    clearTrace()
    setStats(EMPTY_STATS)
    setDisplay([])
    midiInputRouterRef.current.configure([])
    setInputRoutes([])
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
  }, [clearTrace, createWorker])

  useEffect(() => {
    if (!projectLibrary.hydrated) return
    const document = activeProjectDocumentRef.current
    sourceRef.current = document.source
    modulesRef.current = { ...document.modules }
    setEditorSource(document.source)
    const nextVersion = validationVersionRef.current + 1
    validationVersionRef.current = nextVersion
    setSourceVersion(nextVersion)
    setSourceIndex(null)
    setStaticDiagnostics(clearOutdatedSyntaxDiagnostics)
    setContractDiagnostics([])
    setRuntimeDiagnostics([])
    savedStateRef.current = undefined
    setHasSavedState(false)
    sourceIsLoadedRef.current = false
    setSourceIsLoaded(false)
    loadScript()
  }, [loadScript, projectLibrary.active.key, projectLibrary.hydrated])

  useEffect(() => terminateWorker, [terminateWorker])

  const runScript = useCallback(async () => {
    await projectLibrary.flush()
    loadScript()
  }, [loadScript, projectLibrary])

  const selectExample = (exampleId: string) => {
    setFileError(null)
    void projectLibrary.selectTemplate(exampleId)
  }

  const importScript = async (file: File) => {
    try {
      const source = await readLuaScriptFile(file)
      setFileError(null)
      await projectLibrary.importScript(file.name, source)
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      const message = `Could not import ${file.name}: ${detail}`
      setFileError(message)
      appendConsoleEntry('error', message)
      dispatchLayout({ type: 'openDrawer', tab: 'console' })
    }
  }

  const createNewScript = async (draft: ScriptScaffoldDraft) => {
    const result = generateScriptScaffold(draft)
    if (!result.ok) return false
    setFileError(null)
    return projectLibrary.createNew({ filename: result.filename, source: result.source })
  }

  const exportScript = () => {
    try {
      const download = createLuaScriptDownload(sourceRef.current, projectLibrary.active.filename)
      const url = URL.createObjectURL(download.blob)
      try {
        const link = document.createElement('a')
        link.href = url
        link.download = download.filename
        document.body.append(link)
        try {
          link.click()
        } finally {
          link.remove()
        }
      } finally {
        URL.revokeObjectURL(url)
      }
      setFileError(null)
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      const message = `Could not export ${projectLibrary.active.filename}: ${detail}`
      setFileError(message)
      appendConsoleEntry('error', message)
      dispatchLayout({ type: 'openDrawer', tab: 'console' })
    }
  }

  const downloadBackup = async () => {
    try {
      const source = await projectLibrary.backup()
      const url = URL.createObjectURL(new Blob([source], { type: 'application/json;charset=utf-8' }))
      try {
        const link = document.createElement('a')
        link.href = url
        link.download = 'luading-scripts.luading-backup.json'
        document.body.append(link)
        link.click()
        link.remove()
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch (cause) {
      const message = `Could not back up local scripts: ${cause instanceof Error ? cause.message : String(cause)}`
      setFileError(message)
      appendConsoleEntry('error', message)
    }
  }

  const restoreBackup = async (file: File) => {
    try {
      await projectLibrary.restoreBackup(await file.text())
      setFileError(null)
    } catch (cause) {
      const message = `Could not restore ${file.name}: ${cause instanceof Error ? cause.message : String(cause)}`
      setFileError(message)
      appendConsoleEntry('error', message)
    }
  }

  useEffect(() => {
    const unsubscribeState = webMidiManager.subscribe(setWebMidiState)
    const unsubscribeMessages = webMidiManager.subscribeToMessages((message) => {
      if (directMidiInputIdsRef.current.has(message.portId)) {
        post(createMidiEventRequest(message.bytes))
      }
      const updates = midiInputRouterRef.current.route(message)
      if (updates.length > 0) post({ type: 'externalInput', updates })
    })
    return () => {
      unsubscribeMessages()
      unsubscribeState()
      void webMidiManager.close()
    }
  }, [post, webMidiManager])

  useEffect(() => {
    const desired = new Set(directMidiInputIds)
    for (const route of inputRoutes) {
      if (route.kind === 'webMidi' && route.mapping.portId) {
        desired.add(route.mapping.portId)
      }
    }
    const enabled = new Set(webMidiManager.enabledInputIds)
    for (const portId of enabled) {
      if (!desired.has(portId)) void webMidiManager.setInputEnabled(portId, false)
    }
    for (const portId of desired) {
      if (!enabled.has(portId)) void webMidiManager.setInputEnabled(portId, true)
    }
  }, [directMidiInputIds, inputRoutes, webMidiManager])

  useEffect(() => {
    if (!projectLibrary.hydrated) return
    const validationWorker = new Worker(new URL('./validation.worker.ts', import.meta.url), { type: 'module' })
    validationWorkerRef.current = validationWorker
    validationWorker.onmessage = (event: MessageEvent<ValidationWorkerResponse>) => {
      if (!isCurrentValidationResponse(event.data, validationVersionRef.current)) return
      setStaticDiagnostics(event.data.diagnostics)
      setSourceIndex(event.data.sourceIndex)
    }
    return () => {
      validationWorker.terminate()
      validationWorkerRef.current = null
    }
  }, [projectLibrary.hydrated])

  useEffect(() => {
    if (!projectLibrary.hydrated) return
    const version = sourceVersion
    const timeout = window.setTimeout(() => {
      validationWorkerRef.current?.postMessage({
        type: 'validate',
        source: editorSource,
        version,
      })
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [editorSource, projectLibrary.hydrated, sourceVersion])

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
      clearTrace()
      setStats(EMPTY_STATS)
      post({ type: 'resetTelemetry' })
      post({ type: 'start' })
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [clearTrace, post])

  const toggleRunning = () => {
    resumeWhenVisibleRef.current = false
    post({ type: status === 'running' ? 'pause' : 'start' })
  }

  const changeInputRoute = (index: number, route: InputChannelRoute) => {
    setInputRoutes((previous) => previous.map((current, routeIndex) => (
      routeIndex === index ? route : current
    )))
    clearTrace()
    if (route.kind === 'generator') {
      midiInputRouterRef.current.setMapping(index, null)
      post({ type: 'setInputSource', index, config: route.source })
    } else {
      midiInputRouterRef.current.setMapping(index, route.mapping)
      post({
        type: 'setExternalInputSource',
        index,
        value: initialWebMidiInputValue(route.mapping),
      })
    }
  }

  const changeClock = (nextClock: GlobalClockConfig) => {
    setClock(nextClock)
    clearTrace()
    post({ type: 'setClock', config: nextClock })
  }

  const changeParameter = (index: number, value: number) => {
    setParameterValues((previous) => previous.map((item, itemIndex) => itemIndex === index ? value : item))
    clearTrace()
    post({ type: 'setParameter', index, value })
  }

  const applyParameterPreset = (index: number) => {
    clearTrace()
    post({ type: 'applyParameterPreset', index })
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

  const sendMidi = (bytes: number[]) => {
    post(createMidiEventRequest(bytes))
  }

  const toggleDirectMidiInput = (portId: string, enabled: boolean) => {
    const next = new Set(directMidiInputIdsRef.current)
    if (enabled) next.add(portId)
    else next.delete(portId)
    directMidiInputIdsRef.current = next
    setDirectMidiInputIds([...next])
  }

  const changeMidiPortAssignment = (
    destination: DistingMidiDestination,
    portId: string,
  ) => {
    setMidiPortAssignments((previous) => {
      const next = { ...previous }
      if (portId) next[destination] = portId
      else delete next[destination]
      midiPortAssignmentsRef.current = next
      return next
    })
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
  const diagnostics = useMemo(() => resolveDiagnosticLocations(dedupeDiagnostics([
    ...staticDiagnostics,
    ...contractDiagnostics,
    ...runtimeDiagnostics,
    ...performanceDiagnostics,
  ]), sourceIndex, sourceVersion), [
    contractDiagnostics,
    performanceDiagnostics,
    runtimeDiagnostics,
    sourceIndex,
    sourceVersion,
    staticDiagnostics,
  ])
  const qualityReport = useMemo(
    () => calculateQualityReport(diagnostics, stats, sourceIsLoaded),
    [diagnostics, sourceIsLoaded, stats],
  )
  const activeHardwareControls = useMemo(() => hardwareControlsForCallbacks(
    sourceIndex?.callbacks.map((callback) => callback.name) ?? [],
  ), [sourceIndex])
  const qualityLabel = qualityReport.score === null
    ? qualityReport.status === 'invalid'
      ? `${qualityReport.errorCount} errors`
      : 'Run to score'
    : `${qualityReport.score} · ${qualityReport.grade}`
  const sourcePersistenceError = projectLibrary.saveStatus.kind === 'degraded'
    || projectLibrary.saveStatus.kind === 'unsaved'
    ? projectLibrary.saveStatus.message
    : projectLibrary.notice
  const accessibilityAnnouncement = fileError ?? error ?? sourcePersistenceError
    ?? (qualityReport.errorCount > 0
      ? `${qualityReport.errorCount} validation ${qualityReport.errorCount === 1 ? 'error' : 'errors'}. Open Problems for details.`
      : '')

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

  const toggleTheme = () => setTheme(toggledTheme)

  useEffect(() => {
    persistTheme(theme, browserThemeStorage())
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    persistTextSize(textSize, browserThemeStorage())
  }, [textSize])

  useWorkbenchShortcuts({
    canToggleRunning: Boolean(program)
      && (status === 'running' || status === 'paused'),
    onRun: () => void runScript(),
    onToggleRunning: toggleRunning,
    onToggleDrawer: (tab) => dispatchLayout({ type: 'toggleDrawer', tab }),
    onApplyPreset: (preset) => dispatchLayout({ type: 'applyPreset', preset }),
  })

  if (!projectLibrary.hydrated) {
    return (
      <main className="disting-app workbench-shell project-library-boot" aria-busy="true">
        <p role="status">Loading local scripts…</p>
      </main>
    )
  }

  return (
    <WorkbenchShell
      density={resolveWorkbenchDensity(layout.density, touchOriented)}
      theme={theme}
      textSize={textSize}
      announcement={accessibilityAnnouncement}
      commandBar={(
        <CommandBar
          programName={projectLibrary.active.filename}
          selectedExampleId={selectedExampleId}
          activeProjectId={activeProjectId}
          projects={projectLibrary.projects}
          sourceSaveStatus={projectLibrary.saveStatus}
          projectNotice={projectLibrary.notice}
          deletedProjectId={projectLibrary.deletedProjectId}
          storageDurability={projectLibrary.durability}
          scriptGroups={DISTING_SCRIPT_GROUPS}
          status={status}
          simulatedSeconds={stats.simulatedSeconds}
          clock={clock}
          savedState={hasSavedState}
          programLoaded={Boolean(program)}
          workspacePreset={layout.workspacePreset}
          midi={program ? {
            bytes: midiBytes,
            messages: program.midi?.messages ?? [],
            devices: webMidiState,
            enabledInputIds: directMidiInputIds,
            assignments: midiPortAssignments,
          } : undefined}
          qualityLabel={qualityLabel}
          qualityStatus={qualityReport.status}
          qualityErrorCount={qualityReport.errorCount}
          qualityWarningCount={qualityReport.warningCount}
          canToggleRunning={Boolean(program)
            && (status === 'running' || status === 'paused')}
          theme={theme}
          textSize={textSize}
          onSelectExample={selectExample}
          onSelectProject={(id) => void projectLibrary.selectProject(id)}
          onRenameProject={(filename) => void projectLibrary.rename(filename)}
          onDuplicateProject={() => void projectLibrary.duplicate()}
          onDeleteProject={() => void projectLibrary.deleteActive()}
          onUndoDeleteProject={() => void projectLibrary.undoDelete()}
          onBackupProjects={() => void downloadBackup()}
          onRestoreProjects={(file) => void restoreBackup(file)}
          onProtectDrafts={() => void projectLibrary.protectDrafts()}
          onCreateScript={createNewScript}
          onImportScript={(file) => void importScript(file)}
          onExportScript={exportScript}
          onToggleRunning={toggleRunning}
          onRun={() => void runScript()}
          onClockChange={changeClock}
          onSaveState={() => post({ type: 'serialise' })}
          onApplyWorkspacePreset={(preset) => (
            dispatchLayout({ type: 'applyPreset', preset })
          )}
          onMidiBytesChange={setMidiBytes}
          onSendMidi={sendMidi}
          onConnectMidi={() => void webMidiManager.connect()}
          onToggleMidiInput={toggleDirectMidiInput}
          onMidiAssignmentChange={changeMidiPortAssignment}
          onOpenProblems={() => dispatchLayout({ type: 'openDrawer', tab: 'problems' })}
          onToggleTheme={toggleTheme}
          onTextSizeChange={setTextSize}
        />
      )}
      workspace={(
        <SplitPane
          preview={<DraggableDisplayPreview commands={display} />}
          splitPercent={layout.splitPercent}
          narrow={narrow}
          responsiveMode={layout.responsiveMode}
          onSplitChange={(value) => dispatchLayout({ type: 'setSplit', value })}
          onSplitReset={() => dispatchLayout({ type: 'resetSplit' })}
          onResponsiveModeChange={(mode) => (
            dispatchLayout({ type: 'setResponsiveMode', mode })
          )}
          primary={(
            <div
              className="disting-editor-panel workbench-editor"
            >
              <DistingCodeEditor
                value={editorSource}
                diagnostics={diagnostics}
                theme={theme}
                textSize={textSize}
                documentKey={projectLibrary.active.key}
                initialView={projectLibrary.active.editorView}
                revealRequest={revealRequest}
                onChange={updateSource}
                onViewChange={projectLibrary.updateEditorView}
                onRun={() => void runScript()}
              />
            </div>
          )}
          secondary={(
            <InstrumentRack>
              <div className="workbench-instrument-panel">
                <DistingDeviceFace
                  potPositions={potPositions}
                  activeControls={activeHardwareControls}
                  disabled={!program}
                  onPotTurn={turnPot}
                  onEncoderTurn={turnEncoder}
                  onControlPress={(control) => sendControlEvent(control, 'push')}
                  onControlRelease={(control) => sendControlEvent(control, 'release')}
                />

                {program && (
                  <ParameterBank
                    definitions={program.parameters}
                    values={parameterValues}
                    presets={program.parameterPresets}
                    presetsDisabled={status === 'loading' || status === 'error'}
                    onChange={changeParameter}
                    onApplyPreset={applyParameterPreset}
                  />
                )}

              </div>

              {program && (
                <IoDeck
                  program={program}
                  inputRoutes={inputRoutes}
                  midiDevices={webMidiState}
                  midiManager={webMidiManager}
                  values={inputs}
                  outputs={outputs}
                  probes={probes}
                  focusedScopeProbe={focusedScopeProbe}
                  traceHistory={traceHistory}
                  traceRevision={traceRevision}
                  onInputRouteChange={changeInputRoute}
                  onConnectMidi={() => void webMidiManager.connect()}
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
                  traceHistory={traceHistory}
                  traceRevision={traceRevision}
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
      statusBar={<StatusBar />}
    />
  )
}
