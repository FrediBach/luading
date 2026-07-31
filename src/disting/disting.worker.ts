/// <reference lib="webworker" />

import { LuaFactory } from 'wasmoon'
import wasmoonWasmUrl from 'wasmoon/dist/glue.wasm?url'
import { DistingDisplayApi } from './emulation/display-api'
import { findFirstTextOverflow } from './emulation/display-bounds'
import { DistingHardwareApi } from './emulation/hardware-api'
import {
  loadLuaProgramRuntime,
  registerLuaModules,
} from './emulation/lua-runtime'
import {
  describeProgram,
  DISTING_CONSTANTS,
  type LuaInitResult,
  type LuaProgram,
  type LuaProgramRuntime,
} from './emulation/lua-contract'
import {
  LUA_SCRIPT_PARAMETER_OFFSET,
  LuaScriptParameterModel,
} from './emulation/parameter-model'
import {
  ClockTransport,
  DEFAULT_CLOCK,
  SignalBank,
} from './emulation/signal-sources'
import { simulatorDefaultsFromSource } from './emulation/simulator-defaults'
import { DistingPresetApi } from './emulation/preset-api'
import {
  applyCallbackOutput,
  detectInputEdges,
  prepareMidiMessage,
  serialiseJsonState,
  sourceErrorDiagnostic,
  uiCallbackName,
} from './emulation/runtime-helpers'
import {
  DISTING_DISPLAY,
  type CallbackRuntimeStats,
  type DistingDisplayMode,
  type DistingUiControl,
  type DistingUiEventKind,
  type LoadedProgram,
  type RuntimeStats,
  type TracePoint,
  type WorkerRequest,
  type WorkerResponse,
} from './types'
import {
  blocksContractExecution,
  luaSequence,
  validateProgramContract,
} from './validation/contract-validator'
import {
  compareDistingApiSurface,
  DISTING_API,
  DISTING_API_BY_NAME,
} from './validation/api-manifest'
import type {
  LuaCallbackName,
  ScriptDiagnostic,
} from './validation/types'

const workerScope = self as unknown as DedicatedWorkerGlobalScope
const factory = new LuaFactory(wasmoonWasmUrl)
const STEP_MS = DISTING_DISPLAY.stepSeconds * 1000
const DRAW_INTERVAL_MS = 1000 / DISTING_DISPLAY.drawFps
const FRAME_INTERVAL_MS = 1000 / 20
const MAX_CATCH_UP_STEPS = 50
const TRACE_EVERY_STEPS = 1
const MAX_DURATION_SAMPLES = 2000

let lua: Awaited<ReturnType<typeof factory.createEngine>> | null = null
let program: LuaProgram | null = null
let runtime: LuaProgramRuntime | null = null
let metadata: LoadedProgram | null = null
let running = false
let timer: ReturnType<typeof setInterval> | null = null
let lastWallTime = performance.now()
let accumulatorMs = 0
let simulatedSeconds = 0
let stepCount = 0
let droppedSteps = 0
let lastFrameTime = 0
let lastDrawTime = 0
let frameInFlight = false
let inputs: number[] = []
let outputs: number[] = []
let inputHigh: boolean[] = []
let durationSamples: number[] = []
let pendingTrace: TracePoint[] = []
let activeCallback: LuaCallbackName | null = null
let callbackDurationSamples: Partial<Record<LuaCallbackName, number[]>> = {}
let runtimeDiagnosticIds = new Set<string>()
let runtimeDiagnosticList: ScriptDiagnostic[] = []
let loadNotificationSent = false
let parameterModel: LuaScriptParameterModel | null = null
let currentAlgorithmIndex = 1
let currentParameters = new Map<number, number>()
let customUiActive = false
let displayMode: DistingDisplayMode = 'algorithm'

const signals = new SignalBank()
const clock = new ClockTransport()
const display = new DistingDisplayApi()
const preset = new DistingPresetApi()
const DISPLAY_MODES = new Set<DistingDisplayMode>([
  'overview',
  'meters',
  'parameters',
  'ui',
  'algorithm',
  'menu',
])

function post(message: WorkerResponse) {
  workerScope.postMessage(message)
}

const hardware = new DistingHardwareApi((event) => post({ type: 'hardware', event }))

function closeEngine() {
  runtime?.close?.()
  lua?.global.close()
  lua = null
  program = null
  runtime = null
  metadata = null
  parameterModel = null
}

function runtimeDiagnostic(
  ruleId: string,
  callback: LuaCallbackName,
  message: string,
  detail: string,
  suggestion?: string,
): ScriptDiagnostic {
  return {
    id: `runtime:${ruleId}:${callback}`,
    ruleId,
    severity: 'error',
    category: 'contract',
    target: 'hardware',
    origin: 'runtime',
    callback,
    semanticLocation: `callback:${callback}`,
    message,
    detail,
    suggestion,
    penalty: 0,
  }
}

function recordRuntimeDiagnostic(diagnostic: ScriptDiagnostic) {
  if (runtimeDiagnosticIds.has(diagnostic.id)) return
  runtimeDiagnosticIds.add(diagnostic.id)
  runtimeDiagnosticList.push(diagnostic)
  if (loadNotificationSent) post({ type: 'diagnostics', diagnostics: [diagnostic] })
}

function updateOutputs(next: unknown, callback: LuaCallbackName) {
  applyCallbackOutput(outputs, next, callback).forEach(recordRuntimeDiagnostic)
}

function measureCallback<T>(name: LuaCallbackName, callback: () => T) {
  const previousCallback = activeCallback
  activeCallback = name
  const started = performance.now()
  try {
    return callback()
  } finally {
    const samples = callbackDurationSamples[name] ?? []
    samples.push(performance.now() - started)
    if (samples.length > MAX_DURATION_SAMPLES) samples.shift()
    callbackDurationSamples[name] = samples
    activeCallback = previousCallback
  }
}

function observeDisplayCall(name: string) {
  if (activeCallback === 'draw') return
  if (activeCallback === null) {
    recordRuntimeDiagnostic({
      id: `runtime:drawing-outside-callback:${name}`,
      ruleId: `drawing-outside-draw-${name}`,
      severity: 'error',
      category: 'contract',
      target: 'hardware',
      origin: 'runtime',
      semanticLocation: `api-call:${name}`,
      message: `${name}() was called outside draw()`,
      detail: 'Disting drawing functions may only be used while the firmware is invoking draw().',
      suggestion: 'Move this drawing operation into the script draw() callback.',
      penalty: 0,
    })
    return
  }
  recordRuntimeDiagnostic(runtimeDiagnostic(
    `drawing-outside-draw-${name}`,
    activeCallback,
    `${name}() was called while ${activeCallback}() was running`,
    'Disting drawing functions may only be used while the firmware is invoking draw().',
    'Store display state in this callback and render it later from draw().',
  ))
}

function observeDisplayOverflow() {
  const overflow = findFirstTextOverflow(display.commands)
  if (!overflow) return

  const { command, bounds } = overflow
  recordRuntimeDiagnostic({
    id: 'runtime:display-text-outside-frame:draw',
    ruleId: 'display-text-outside-frame',
    severity: 'warning',
    category: 'contract',
    target: 'hardware',
    origin: 'runtime',
    callback: 'draw',
    message: `${command.tiny ? 'drawTinyText' : 'drawText'}() placed text outside the display`,
    detail: `The text at (${command.x}, ${command.y}) rasterizes to x=${bounds.left}–${bounds.right}, y=${bounds.top}–${bounds.bottom}; the Disting NT framebuffer is 256×64 pixels (x=0–255, y=0–63). Hardware clips pixels outside that range.`,
    suggestion: 'Move the text baseline or horizontal anchor so the complete glyph bounds remain inside the framebuffer.',
    penalty: 0,
  })
}

function finiteIndex(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined
}

function algorithmName(algorithmIndex: unknown) {
  const index = finiteIndex(algorithmIndex)
  if (program && index === program.algorithmIndex) return program.name ?? 'Lua Script'
  return preset.getAlgorithmName(index)
}

function parameterInfo(algorithmIndex: unknown, parameterIndex: unknown) {
  const index = finiteIndex(algorithmIndex)
  if (index === program?.algorithmIndex) {
    return parameterModel?.info(parameterIndex)
  }
  const companion = preset.getParameterInfo(index, parameterIndex)
  if (!companion) return undefined
  return {
    definition: {
      name: companion.name,
      min: companion.min,
      max: companion.max,
      value: companion.value,
      unit: '',
      scale: 1,
    },
    value: companion.value,
  }
}

function focusParameter(algorithmIndex: unknown, parameterIndex: unknown) {
  const algorithm = finiteIndex(algorithmIndex)
  const parameter = finiteIndex(parameterIndex)
  if (algorithm === undefined || !algorithmName(algorithm) || parameter === undefined) return false
  const count = algorithm === program?.algorithmIndex
    ? parameterModel?.count ?? 0
    : preset.getParameterCount(algorithm) ?? 0
  if (parameter < 1 || parameter > count) return false
  currentAlgorithmIndex = algorithm
  currentParameters.set(algorithm, parameter)
  return true
}

function setParameterValue(
  algorithmIndex: unknown,
  parameterIndex: unknown,
  value: unknown,
  focus: unknown = true,
) {
  const algorithm = finiteIndex(algorithmIndex)
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  if (algorithm === program?.algorithmIndex) {
    const changed = parameterModel?.set(parameterIndex, value)
    if (!changed) return false
    if (changed.scriptIndex !== undefined && program?.parameters) {
      program.parameters[changed.scriptIndex] = changed.value
      runtime?.setParameter(changed.scriptIndex + 1, changed.value)
    }
    if (focus !== false) focusParameter(algorithm, parameterIndex)
    return true
  }
  const changed = preset.setParameter(algorithm, parameterIndex, value)
  if (changed && focus !== false) focusParameter(algorithm, parameterIndex)
  return changed
}

function setParameterNormalized(
  algorithmIndex: unknown,
  parameterIndex: unknown,
  value: unknown,
  focus: unknown = true,
) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  const info = parameterInfo(algorithmIndex, parameterIndex)
  if (!info) return false
  const normalized = Math.min(1, Math.max(0, value))
  return setParameterValue(
    algorithmIndex,
    parameterIndex,
    info.definition.min + normalized * (info.definition.max - info.definition.min),
    focus,
  )
}

function standardPotTurn(pot: 1 | 2 | 3, value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return
  const algorithm = currentAlgorithmIndex
  const count = algorithm === program?.algorithmIndex
    ? parameterModel?.count ?? 0
    : preset.getParameterCount(algorithm) ?? 0
  if (count === 0) return
  const defaultParameter = algorithm === program?.algorithmIndex
    ? parameterModel?.defaultParameterIndex ?? 1
    : 1
  if (pot === 3) {
    setParameterNormalized(
      algorithm,
      currentParameters.get(algorithm) ?? defaultParameter,
      value,
    )
    return
  }
  const normalized = Math.min(1, Math.max(0, value))
  const index = Math.min(count - 1, Math.floor(normalized * count))
  const selected = pot === 1 ? Math.floor(index / 3) * 3 : index
  focusParameter(algorithm, selected + 1)
}

async function registerDistingGlobals() {
  if (!lua) return

  const registeredApiNames = new Set<string>()
  const apiGlobals = {
    set(name: string, value: unknown) {
      if (!DISTING_API_BY_NAME.has(name)) {
        throw new Error(`Runtime Disting API ${name} is missing contract metadata.`)
      }
      registeredApiNames.add(name)
      lua?.global.set(name, value)
    },
  }

  for (const [name, value] of Object.entries(DISTING_CONSTANTS)) {
    lua.global.set(name, value)
  }

  apiGlobals.set('print', (...values: unknown[]) => {
    post({ type: 'log', line: values.map(String).join('\t') })
  })
  apiGlobals.set('getCpuCycleCount', () => Math.floor(performance.now() * 600_000) >>> 0)
  apiGlobals.set('getAlgorithmCount', () => preset.getAlgorithmCount())
  apiGlobals.set('getAlgorithmName', algorithmName)
  apiGlobals.set('getCurrentAlgorithm', () => currentAlgorithmIndex)
  apiGlobals.set('getCurrentParameter', (algorithmIndex: unknown) => {
    const algorithm = finiteIndex(algorithmIndex)
    if (algorithm === undefined || !algorithmName(algorithm)) return undefined
    const defaultParameter = algorithm === program?.algorithmIndex
      ? parameterModel?.defaultParameterIndex ?? 1
      : 1
    return currentParameters.get(algorithm) ?? defaultParameter
  })
  lua.global.set('__findAlgorithmMatches', (name: unknown) => {
    const matches: number[] = []
    if (typeof name === 'string' && name === program?.name && program.algorithmIndex) {
      matches.push(program.algorithmIndex)
    }
    return [...matches, ...(preset.findAlgorithms(name) ?? [])]
  })
  lua.global.set('__findParameterMatches', (algorithmIndex: unknown, name: unknown) => {
    if (program && algorithmIndex === program.algorithmIndex) {
      return parameterModel?.findParameters(name) ?? []
    }
    return preset.findParameters(algorithmIndex, name) ?? []
  })
  await lua.doString(`
    function findAlgorithm(name)
      return table.unpack(__findAlgorithmMatches(name))
    end
    function findParameter(algorithmIndex, name)
      return table.unpack(__findParameterMatches(algorithmIndex, name))
    end
  `)
  for (const entry of DISTING_API) {
    if (entry.runtimeRegistration === 'lua') registeredApiNames.add(entry.name)
  }
  apiGlobals.set('focusParameter', (algorithmIndex: unknown, parameterIndex: unknown) => {
    focusParameter(algorithmIndex, parameterIndex)
  })
  apiGlobals.set('getParameter', (algorithmIndex: unknown, parameterIndex: unknown) => (
    parameterInfo(algorithmIndex, parameterIndex)?.value
  ))
  apiGlobals.set('getParameterCount', (algorithmIndex: unknown) => {
    const algorithm = finiteIndex(algorithmIndex)
    return algorithm === program?.algorithmIndex
      ? parameterModel?.count ?? 0
      : preset.getParameterCount(algorithm)
  })
  apiGlobals.set('getParameterName', (algorithmIndex: unknown, parameterIndex: unknown) => (
    parameterInfo(algorithmIndex, parameterIndex)?.definition.name
  ))
  apiGlobals.set('setParameter', (
    algorithmIndex: unknown,
    parameterIndex: unknown,
    value: unknown,
    focus: unknown = true,
  ) => {
    setParameterValue(algorithmIndex, parameterIndex, value, focus)
  })
  apiGlobals.set('setParameterNormalized', (
    algorithmIndex: unknown,
    parameterIndex: unknown,
    value: unknown,
    focus: unknown = true,
  ) => {
    setParameterNormalized(algorithmIndex, parameterIndex, value, focus)
  })
  apiGlobals.set('standardPot1Turn', (value: unknown) => standardPotTurn(1, value))
  apiGlobals.set('standardPot2Turn', (value: unknown) => standardPotTurn(2, value))
  apiGlobals.set('standardPot3Turn', (value: unknown) => standardPotTurn(3, value))
  apiGlobals.set('getBusVoltage', (algorithmIndex: unknown, busIndex: unknown) => {
    const algorithm = finiteIndex(algorithmIndex)
    const index = finiteIndex(busIndex) ?? -1
    if (algorithm === 0 || algorithm === program?.algorithmIndex) return inputs[index] ?? 0
    return 0
  })
  apiGlobals.set('sendI2CCommand', (address: unknown, ...data: unknown[]) => (
    hardware.sendI2CCommand(address, ...data)
  ))
  apiGlobals.set('sendI2CGetter', (
    address: unknown,
    responseLength: unknown,
    ...data: unknown[]
  ) => hardware.sendI2CGetter(address, responseLength, ...data))
  apiGlobals.set('sendMIDI', (destinations: unknown, ...data: unknown[]) => (
    hardware.sendMIDI(destinations, ...data)
  ))
  apiGlobals.set('setDisplayMode', (mode: unknown) => {
    if (typeof mode !== 'string' || !DISPLAY_MODES.has(mode as DistingDisplayMode)) return
    displayMode = mode as DistingDisplayMode
    customUiActive = displayMode === 'ui'
      || (displayMode === 'algorithm' && metadata?.customUi === true)
    post({ type: 'hardware', event: { kind: 'displayMode', mode: displayMode } })
  })
  apiGlobals.set('exit', () => {
    customUiActive = false
    displayMode = 'algorithm'
    post({ type: 'hardware', event: { kind: 'exit' } })
  })
  display.register(apiGlobals, observeDisplayCall, {
    algorithmName,
    parameter: parameterInfo,
  })

  const surface = compareDistingApiSurface(registeredApiNames)
  if (surface.missing.length > 0 || surface.unexpected.length > 0) {
    throw new Error([
      surface.missing.length > 0 ? `missing: ${surface.missing.join(', ')}` : '',
      surface.unexpected.length > 0 ? `unexpected: ${surface.unexpected.join(', ')}` : '',
    ].filter(Boolean).join('; '))
  }
}

async function loadProgram(
  source: string,
  modules: Record<string, string> = {},
  restoredState?: unknown,
) {
  pause(false)
  closeEngine()
  resetRuntime()

  try {
    lua = await factory.createEngine()
    await registerDistingGlobals()
    await registerLuaModules(lua, modules)
    const result: unknown = await loadLuaProgramRuntime(lua, source)
    if (!result || typeof result !== 'object') {
      throw new Error('The script must return a table containing init/step/draw callbacks.')
    }

    runtime = result as LuaProgramRuntime
    program = runtime.program
    if (!program || typeof program !== 'object') {
      throw new Error('The script must return a table containing init/step/draw callbacks.')
    }
    program.algorithmIndex = 1
    program.parameterOffset = LUA_SCRIPT_PARAMETER_OFFSET
    runtime.configure(program.algorithmIndex, program.parameterOffset)
    if (restoredState !== undefined) runtime.setState(restoredState)
    currentAlgorithmIndex = program.algorithmIndex

    const rawInitResult = runtime.init
      ? measureCallback('init', () => runtime?.init?.())
      : undefined
    const diagnostics = validateProgramContract(program, rawInitResult)
    if (blocksContractExecution(diagnostics)) {
      const errorCount = diagnostics.filter((diagnostic) => (
        diagnostic.origin === 'contract' && diagnostic.severity === 'error'
      )).length
      closeEngine()
      post({
        type: 'error',
        message: `${errorCount} contract ${errorCount === 1 ? 'error prevents' : 'errors prevent'} this script from running.`,
        diagnostics,
      })
      return
    }
    const initResult = rawInitResult && typeof rawInitResult === 'object'
      ? rawInitResult as LuaInitResult
      : {}
    metadata = describeProgram(program, initResult)
    const simulatorDefaults = simulatorDefaultsFromSource(
      source,
      metadata.inputKinds,
      metadata.outputCount,
    )
    metadata.outputAudioDefaults = simulatorDefaults.outputAudioRoutes
    parameterModel = new LuaScriptParameterModel(metadata)
    inputs = Array.from({ length: metadata.inputCount }, () => 0)
    outputs = Array.from({ length: metadata.outputCount }, () => 0)
    inputHigh = Array.from({ length: metadata.inputCount }, () => false)
    signals.configure(metadata.inputKinds, simulatorDefaults.inputSources)
    program.parameters = parameterModel.scriptValues()
    runtime.setParameters(program.parameters as number[])
    currentParameters.set(program.algorithmIndex, parameterModel.defaultParameterIndex)
    customUiActive = runtime.ui?.() === true
    metadata.customUi = customUiActive
    if (customUiActive && runtime.setupUi) {
      const positions = luaSequence(runtime.setupUi())
      metadata.uiPotPositions = [0, 1, 2].map((index) => {
        const value = positions?.[index]
        return typeof value === 'number' && Number.isFinite(value)
          ? Math.min(1, Math.max(0, value))
          : null
      })
    }

    renderDisplay()
    post({
      type: 'loaded',
      program: metadata,
      inputSources: signals.configs,
      diagnostics: [...diagnostics, ...runtimeDiagnosticList],
    })
    loadNotificationSent = true
    postFrame([])
  } catch (error) {
    closeEngine()
    const message = error instanceof Error ? error.message : String(error)
    post({ type: 'error', message, diagnostic: sourceErrorDiagnostic(message) })
  }
}

function resetRuntime() {
  lastWallTime = performance.now()
  accumulatorMs = 0
  simulatedSeconds = 0
  stepCount = 0
  droppedSteps = 0
  lastFrameTime = 0
  lastDrawTime = 0
  frameInFlight = false
  inputs = []
  outputs = []
  inputHigh = []
  durationSamples = []
  pendingTrace = []
  activeCallback = null
  callbackDurationSamples = {}
  runtimeDiagnosticIds = new Set()
  runtimeDiagnosticList = []
  loadNotificationSent = false
  currentAlgorithmIndex = 1
  currentParameters = new Map()
  customUiActive = false
  displayMode = 'algorithm'
  clock.reset(DEFAULT_CLOCK)
  display.reset()
  preset.reset()
}

function makeStats(): RuntimeStats {
  const sorted = [...durationSamples].sort((a, b) => a - b)
  const sum = durationSamples.reduce((total, value) => total + value, 0)
  const averageUs = durationSamples.length > 0 ? (sum / durationSamples.length) * 1000 : 0
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1)
  const p95Us = sorted.length > 0 ? sorted[p95Index] * 1000 : 0
  const maxUs = sorted.length > 0 ? sorted[sorted.length - 1] * 1000 : 0

  const callbacks: RuntimeStats['callbacks'] = {}
  for (const name of ['init', 'step', 'trigger', 'gate', 'draw'] as const) {
    const samples = callbackDurationSamples[name]
    if (!samples || samples.length === 0) continue
    const ordered = [...samples].sort((a, b) => a - b)
    const total = samples.reduce((sum, value) => sum + value, 0)
    const p95 = Math.max(0, Math.ceil(ordered.length * 0.95) - 1)
    callbacks[name] = {
      calls: samples.length,
      averageUs: (total / samples.length) * 1000,
      p95Us: ordered[p95] * 1000,
      maxUs: ordered[ordered.length - 1] * 1000,
    } satisfies CallbackRuntimeStats
  }

  return {
    simulatedSeconds,
    steps: stepCount,
    averageUs,
    p95Us,
    maxUs,
    budgetPercent: averageUs / 10,
    droppedSteps,
    callbacks,
  }
}

function renderDisplay() {
  display.reset()
  if (displayMode !== 'algorithm' && displayMode !== 'ui') {
    display.showSystemScreen(displayMode, algorithmName(currentAlgorithmIndex) ?? 'Lua Script')
    return
  }
  const focusedAlgorithmIndex = program?.algorithmIndex ?? 1
  const focusedParameter = program
    ? parameterInfo(
        focusedAlgorithmIndex,
        currentParameters.get(focusedAlgorithmIndex)
          ?? parameterModel?.defaultParameterIndex
          ?? 1,
      )
    : undefined
  if (displayMode === 'algorithm' && metadata?.customUi && !customUiActive) {
    display.finish(
      false,
      focusedParameter?.definition,
      focusedParameter?.value,
    )
    return
  }
  const suppressStandardLine = runtime?.draw
    ? measureCallback('draw', () => runtime?.draw?.()) === true
    : false
  display.finish(
    suppressStandardLine,
    focusedParameter?.definition,
    focusedParameter?.value,
  )
  observeDisplayOverflow()
}

function dispatchInputEdges(nextInputs: number[]) {
  if (!program || !metadata) return

  const detected = detectInputEdges(nextInputs, metadata.inputKinds, inputHigh)
  inputHigh = detected.nextHigh
  for (const event of detected.events) {
    if (event.kind === 'trigger') {
      const result = runtime?.trigger
        ? measureCallback('trigger', () => runtime?.trigger?.(event.input))
        : undefined
      updateOutputs(result, 'trigger')
    } else {
      const result = runtime?.gate
        ? measureCallback('gate', () => runtime?.gate?.(event.input, event.rising))
        : undefined
      updateOutputs(result, 'gate')
    }
  }
}

function runStep() {
  if (!program) return

  const nextInputs = signals.sample(clock, simulatedSeconds, stepCount)
  inputs = nextInputs
  dispatchInputEdges(nextInputs)

  const started = performance.now()
  const result = runtime?.step
    ? measureCallback('step', () => runtime?.step?.(DISTING_DISPLAY.stepSeconds, inputs))
    : undefined
  updateOutputs(result, 'step')
  durationSamples.push(performance.now() - started)
  if (durationSamples.length > MAX_DURATION_SAMPLES) durationSamples.shift()

  stepCount += 1
  simulatedSeconds += DISTING_DISPLAY.stepSeconds
  clock.advance(DISTING_DISPLAY.stepSeconds)

  if (!frameInFlight && stepCount % TRACE_EVERY_STEPS === 0) {
    pendingTrace.push({
      time: simulatedSeconds,
      inputs: [...inputs],
      outputs: [...outputs],
    })
  }
}

function postFrame(trace: TracePoint[]) {
  if (frameInFlight) return false
  frameInFlight = true
  post({
    type: 'frame',
    trace,
    inputs: [...inputs],
    outputs: [...outputs],
    parameterValues: program?.parameters?.map((value) => (
      typeof value === 'number' && Number.isFinite(value) ? value : 0
    )) ?? [],
    stats: makeStats(),
    display: [...display.commands],
  })
  return true
}

function resetTelemetry() {
  durationSamples = []
  callbackDurationSamples = {}
  pendingTrace = []
  droppedSteps = 0
  lastFrameTime = performance.now()
}

function tick() {
  try {
    if (!running || !program) return

    const now = performance.now()
    accumulatorMs += Math.min(now - lastWallTime, 250)
    lastWallTime = now

    let dueSteps = Math.floor(accumulatorMs / STEP_MS)
    if (dueSteps > MAX_CATCH_UP_STEPS) {
      droppedSteps += dueSteps - MAX_CATCH_UP_STEPS
      dueSteps = MAX_CATCH_UP_STEPS
      accumulatorMs = 0
    } else {
      accumulatorMs -= dueSteps * STEP_MS
    }

    for (let index = 0; index < dueSteps; index += 1) runStep()

    if (now - lastDrawTime >= DRAW_INTERVAL_MS) {
      lastDrawTime = now
      renderDisplay()
    }

    if (now - lastFrameTime >= FRAME_INTERVAL_MS) {
      lastFrameTime = now
      if (postFrame(pendingTrace)) pendingTrace = []
    }
  } catch (error) {
    pause()
    const message = error instanceof Error ? error.message : String(error)
    post({ type: 'error', message, diagnostic: sourceErrorDiagnostic(message) })
  }
}

function start() {
  if (!program || running) return
  running = true
  lastWallTime = performance.now()
  timer = setInterval(tick, 8)
  post({ type: 'running', running: true })
}

function pause(notify = true) {
  running = false
  if (timer !== null) clearInterval(timer)
  timer = null
  if (notify) post({ type: 'running', running: false })
}

function dispatchUiEvent(
  control: DistingUiControl,
  event: DistingUiEventKind,
  value?: number,
) {
  if (!runtime || !program) return
  const callback = uiCallbackName(control, event)
  if (customUiActive) {
    runtime.callUi(callback, event === 'turn' ? value : undefined)
  } else if (event === 'turn' && control.startsWith('pot')) {
    const pot = Number(control.slice(-1))
    if (pot === 1 || pot === 2 || pot === 3) standardPotTurn(pot, value)
  }
  renderDisplay()
  postFrame([])
}

function dispatchMidi(bytes: number[]) {
  if (!runtime?.midiMessage) return
  const message = prepareMidiMessage(bytes, metadata?.midi, program?.parameters)
  if (!message) return
  runtime.midiMessage(message)
  renderDisplay()
  postFrame([])
}

function serialiseState() {
  const result = serialiseJsonState(runtime?.serialise?.() ?? program?.state ?? null)
  if (result.error) post({ type: 'log', line: result.error })
  return result.state
}

function handleMessage(message: WorkerRequest) {
  try {
    switch (message.type) {
      case 'load':
        void loadProgram(message.source, message.modules, message.state)
        break
      case 'start':
        start()
        break
      case 'pause':
        pause()
        break
      case 'frameAck':
        frameInFlight = false
        break
      case 'resetTelemetry':
        resetTelemetry()
        break
      case 'setInputSource':
        signals.set(message.index, message.config)
        inputHigh[message.index] = false
        break
      case 'setClock':
        clock.set(message.config)
        break
      case 'setParameter':
        if (program?.parameters && message.index >= 0 && message.index < program.parameters.length) {
          setParameterValue(
            program.algorithmIndex,
            (program.parameterOffset ?? 0) + message.index + 1,
            message.value,
          )
          renderDisplay()
        }
        break
      case 'trigger':
        if (runtime?.trigger) {
          updateOutputs(
            measureCallback('trigger', () => runtime?.trigger?.(message.index + 1)),
            'trigger',
          )
        }
        break
      case 'uiEvent':
        dispatchUiEvent(message.control, message.event, message.value)
        break
      case 'midi':
        dispatchMidi(message.bytes)
        break
      case 'serialise':
        post({ type: 'serialised', state: serialiseState() })
        break
    }
  } catch (error) {
    pause()
    const messageText = error instanceof Error ? error.message : String(error)
    post({ type: 'error', message: messageText, diagnostic: sourceErrorDiagnostic(messageText) })
  }
}

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => handleMessage(event.data)
post({ type: 'ready' })
