import { useState, useCallback, useMemo } from 'react'
import { LuaFactory } from 'wasmoon'
import type { WasmExports } from './wasm'
import * as ts from './assembly'

// ── Types ────────────────────────────────────────────────────────────────────

type BenchFn = (arg: number) => number

interface BenchmarkDef {
  name: string
  description: string
  tsImpl: BenchFn
  wasmImpl: BenchFn
  /** If present, this benchmark also runs a Lua/wasmoon variant. */
  luaImpl?: (arg: number, iterations: number) => Promise<number>
  defaultArg: number
  argLabel: string
  argMin: number
  argMax: number
}

interface BenchmarkResult {
  name: string
  tsMs: number
  wasmMs: number
  /** Elapsed ms for the Lua variant, if applicable. */
  luaMs?: number
  iterations: number
}

// Worker benchmark result: wall-clock time + aggregated CPU time across workers
interface WorkerBenchmarkResult {
  name: string
  /** Wall-clock time from first worker spawn to last worker completing */
  wallMs: number
  /** Sum of all workers' WASM time (total CPU time spent in WASM across workers) */
  totalWasmMs: number
  /** Sum of all workers' TS time */
  totalTsMs: number
  /** Sum of all workers' Lua time, present only for benchmarks that include a Lua variant */
  totalLuaMs?: number
  iterations: number
  workerCount: number
}

// ── Benchmark runner ─────────────────────────────────────────────────────────

const WARMUP_ITERATIONS = 50

function runBench(fn: BenchFn, arg: number, iterations: number): number {
  // Warmup — lets the JS engine JIT-compile before we measure
  for (let i = 0; i < WARMUP_ITERATIONS; i++) fn(arg)

  const start = performance.now()
  for (let i = 0; i < iterations; i++) fn(arg)
  return performance.now() - start
}

function msPerOp(totalMs: number, iterations: number): string {
  const us = (totalMs / iterations) * 1000
  if (us < 1) return `${(us * 1000).toFixed(0)} ns/op`
  if (us < 1000) return `${us.toFixed(2)} µs/op`
  return `${(us / 1000).toFixed(3)} ms/op`
}

// ── Lua runner ────────────────────────────────────────────────────────────────

// Singleton factory — reuse across runs (engine is created fresh each time, but
// the factory itself (which loads the wasmoon .wasm once) is shared).
const luaFactory = new LuaFactory()

/**
 * Run iterative Fibonacci(n) `iterations` times inside a single Lua script.
 * The loop runs entirely in Lua so that JS→Lua call overhead doesn't dominate.
 * Returns wall-clock ms measured from JS around the doString call.
 */
async function runLuaFibonacci(n: number, iterations: number): Promise<number> {
  const lua = await luaFactory.createEngine()
  try {
    // Suppress any print output during the bench
    lua.global.set('print', () => {})

    // Warmup pass — gets the Lua interpreter into a steady state
    const warmupScript = `
      local function fib(n)
        if n <= 1 then return n end
        local a, b = 0, 1
        for _ = 2, n do a, b = b, a + b end
        return b
      end
      for _ = 1, ${WARMUP_ITERATIONS} do fib(${n}) end
    `
    await lua.doString(warmupScript)

    // Timed pass
    const timedScript = `
      local function fib(n)
        if n <= 1 then return n end
        local a, b = 0, 1
        for _ = 2, n do a, b = b, a + b end
        return b
      end
      for _ = 1, ${iterations} do fib(${n}) end
    `
    const start = performance.now()
    await lua.doString(timedScript)
    return performance.now() - start
  } finally {
    lua.global.close()
  }
}

// ── Worker helpers ────────────────────────────────────────────────────────────

interface WorkerSliceResult {
  wasmMs: number
  tsMs: number
  luaMs?: number
}

/** Spawn one worker, send it a slice, resolve when it posts back a result. */
function runWorkerSlice(
  fn: string,
  arg: number,
  iterations: number,
  wasmUrl: string,
): Promise<WorkerSliceResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./bench.worker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.onmessage = (e: MessageEvent<WorkerSliceResult & { error?: string }>) => {
      worker.terminate()
      if (e.data.error) {
        reject(new Error(e.data.error))
      } else {
        resolve(e.data)
      }
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message))
    }
    worker.postMessage({ fn, arg, iterations, wasmUrl })
  })
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  wasm: WasmExports
}

export function BenchmarkRunner({ wasm }: Props) {
  const benchmarks = useMemo<BenchmarkDef[]>(() => [
    {
      name: 'add',
      description: 'Integer addition',
      // Benchmark with a = b = arg so the single slider controls the magnitude
      tsImpl: (n) => ts.add(n, n),
      wasmImpl: (n) => wasm.add(n, n),
      defaultArg: 42,
      argLabel: 'a = b',
      argMin: 0,
      argMax: 1_000_000,
    },
    {
      name: 'fibonacci',
      description: 'Iterative Fibonacci',
      tsImpl: ts.fibonacci,
      wasmImpl: wasm.fibonacci,
      luaImpl: runLuaFibonacci,
      defaultArg: 40,
      argLabel: 'n',
      argMin: 0,
      argMax: 46,
    },
    {
      name: 'matMul',
      description: 'n×n matrix multiplication (f64, row-major)',
      tsImpl: ts.matMul,
      wasmImpl: wasm.matMul,
      defaultArg: 8,
      argLabel: 'n (side)',
      argMin: 2,
      argMax: 256,
    },
  ], [wasm])

  const [iterations, setIterations] = useState(100_000)
  const [args, setArgs] = useState<Record<string, number>>(
    Object.fromEntries(benchmarks.map((b) => [b.name, b.defaultArg])),
  )
  const [results, setResults] = useState<BenchmarkResult[]>([])
  const [running, setRunning] = useState<string | null>(null) // name of currently running bench

  // ── Worker state ────────────────────────────────────────────────────────────
  const [workerCount, setWorkerCount] = useState(
    () => Math.max(1, navigator.hardwareConcurrency ?? 4),
  )
  const [workerResults, setWorkerResults] = useState<WorkerBenchmarkResult[]>([])
  const [workerRunning, setWorkerRunning] = useState<string | null>(null)

  // ── Single-threaded runner ───────────────────────────────────────────────────

  const runOne = useCallback(
    async (bench: BenchmarkDef) => {
      setRunning(bench.name)
      const arg = args[bench.name]

      // Yield to the browser so the UI updates before we block the thread
      await new Promise((r) => setTimeout(r, 50))

      const wasmMs = runBench(bench.wasmImpl, arg, iterations)
      const tsMs = runBench(bench.tsImpl, arg, iterations)

      // Lua variant — runs async, after the sync benchmarks
      const luaMs = bench.luaImpl ? await bench.luaImpl(arg, iterations) : undefined

      setResults((prev) => {
        const next = prev.filter((r) => r.name !== bench.name)
        return [...next, { name: bench.name, tsMs, wasmMs, luaMs, iterations }]
      })
      setRunning(null)
    },
    [args, iterations],
  )

  const runAll = useCallback(async () => {
    for (const bench of benchmarks) {
      await runOne(bench)
    }
  }, [benchmarks, runOne])

  // ── Worker runner ────────────────────────────────────────────────────────────

  const runOneWorker = useCallback(
    async (bench: BenchmarkDef) => {
      setWorkerRunning(bench.name)

      // Build the WASM URL (same logic as wasm.ts, but workers need an absolute URL)
      const wasmUrl = new URL('./build/assembly.wasm', import.meta.url)
      const cacheBust = import.meta.env.DEV ? `?t=${Date.now()}` : ''
      const wasmUrlStr = wasmUrl.href + cacheBust

      const arg = args[bench.name]

      // Divide iterations as evenly as possible across workers
      const baseSlice = Math.floor(iterations / workerCount)
      const remainder = iterations % workerCount

      // Start all workers simultaneously
      const wallStart = performance.now()
      const slicePromises = Array.from({ length: workerCount }, (_, i) => {
        const sliceIterations = baseSlice + (i === workerCount - 1 ? remainder : 0)
        return runWorkerSlice(bench.name, arg, sliceIterations, wasmUrlStr)
      })

      let slices: WorkerSliceResult[]
      try {
        slices = await Promise.all(slicePromises)
      } catch (err) {
        console.error('[workers] benchmark failed:', err)
        setWorkerRunning(null)
        return
      }
      const wallMs = performance.now() - wallStart

      const totalWasmMs = slices.reduce((sum, s) => sum + s.wasmMs, 0)
      const totalTsMs   = slices.reduce((sum, s) => sum + s.tsMs, 0)
      const totalLuaMs  = slices.every((s) => s.luaMs !== undefined)
        ? slices.reduce((sum, s) => sum + s.luaMs!, 0)
        : undefined

      setWorkerResults((prev) => {
        const next = prev.filter((r) => r.name !== bench.name)
        return [
          ...next,
          {
            name: bench.name,
            wallMs,
            totalWasmMs,
            totalTsMs,
            totalLuaMs,
            iterations,
            workerCount,
          },
        ]
      })
      setWorkerRunning(null)
    },
    [args, iterations, workerCount],
  )

  const runAllWorkers = useCallback(async () => {
    for (const bench of benchmarks) {
      await runOneWorker(bench)
    }
  }, [benchmarks, runOneWorker])

  const anyRunning = running !== null || workerRunning !== null

  return (
    <div className="bench-root">
      {/* ── Global controls ── */}
      <div className="bench-controls">
        <label className="bench-label">
          Iterations
          <input
            type="number"
            className="bench-input"
            value={iterations}
            min={1}
            max={10_000_000}
            step={10_000}
            onChange={(e) => setIterations(Math.max(1, Number(e.target.value)))}
          />
        </label>
        <button
          className="bench-btn bench-btn--primary"
          onClick={runAll}
          disabled={anyRunning}
        >
          {running !== null ? `Running ${running}…` : 'Run all'}
        </button>
      </div>

      {/* ── Per-benchmark rows (single-threaded) ── */}
      <div className="bench-list">
        {benchmarks.map((bench) => {
          const result = results.find((r) => r.name === bench.name)
          const isRunning = running === bench.name

          return (
            <div key={bench.name} className="bench-card">
              <div className="bench-card-header">
                <div>
                  <span className="bench-card-name">{bench.name}()</span>
                  <span className="bench-card-desc">{bench.description}</span>
                </div>
                <div className="bench-card-controls">
                  <label className="bench-label">
                    {bench.argLabel}
                    <input
                      type="number"
                      className="bench-input bench-input--sm"
                      value={args[bench.name]}
                      min={bench.argMin}
                      max={bench.argMax}
                      onChange={(e) =>
                        setArgs((prev) => ({ ...prev, [bench.name]: Number(e.target.value) }))
                      }
                    />
                  </label>
                  <button
                    className="bench-btn"
                    onClick={() => runOne(bench)}
                    disabled={anyRunning}
                  >
                    {isRunning ? 'Running…' : 'Run'}
                  </button>
                </div>
              </div>

              {result && <BenchResult result={result} />}
            </div>
          )
        })}
      </div>

      {/* ── Web Worker section ── */}
      <div className="bench-workers-section">
        <div className="bench-workers-header">
          <div className="bench-workers-title-row">
            <h3 className="bench-workers-title">Web Workers</h3>
            <p className="bench-workers-desc">
              Same iterations split evenly across W workers running in parallel.
              Wall-clock time measures real parallel throughput; total CPU time
              is the sum across all workers.
            </p>
          </div>
          <div className="bench-controls">
            <label className="bench-label">
              Workers
              <input
                type="number"
                className="bench-input bench-input--sm"
                value={workerCount}
                min={1}
                max={16}
                step={1}
                onChange={(e) =>
                  setWorkerCount(Math.min(16, Math.max(1, Number(e.target.value))))
                }
              />
            </label>
            <button
              className="bench-btn bench-btn--primary"
              onClick={runAllWorkers}
              disabled={anyRunning}
            >
              {workerRunning !== null ? `Running ${workerRunning}…` : 'Run all (workers)'}
            </button>
          </div>
        </div>

        <div className="bench-list">
          {benchmarks.map((bench) => {
            const workerResult = workerResults.find((r) => r.name === bench.name)
            const singleResult = results.find((r) => r.name === bench.name)
            const isRunning = workerRunning === bench.name

            return (
              <div key={bench.name} className="bench-card">
                <div className="bench-card-header">
                  <div>
                    <span className="bench-card-name">{bench.name}()</span>
                    <span className="bench-card-desc">{bench.description}</span>
                  </div>
                  <div className="bench-card-controls">
                    <button
                      className="bench-btn"
                      onClick={() => runOneWorker(bench)}
                      disabled={anyRunning}
                    >
                      {isRunning ? 'Running…' : 'Run'}
                    </button>
                  </div>
                </div>

                {workerResult && (
                  <WorkerBenchResult
                    result={workerResult}
                    singleThreaded={singleResult ?? null}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Single-threaded result display ────────────────────────────────────────────

function BenchResult({ result }: { result: BenchmarkResult }) {
  const { tsMs, wasmMs, luaMs, iterations } = result

  // Find the fastest among available variants
  const times: { key: 'wasm' | 'ts' | 'lua'; ms: number }[] = [
    { key: 'wasm', ms: wasmMs },
    { key: 'ts',   ms: tsMs },
    ...(luaMs !== undefined ? [{ key: 'lua' as const, ms: luaMs }] : []),
  ]
  const slowestMs = Math.max(...times.map((t) => t.ms))
  const fastestMs = Math.min(...times.map((t) => t.ms))
  const fastest = times.find((t) => t.ms === fastestMs)!.key

  const ratio = slowestMs / fastestMs
  const ratioLabel = ratio < 1.02 ? 'roughly equal' : `${ratio.toFixed(2)}× faster`

  function barPct(ms: number) {
    return (ms / slowestMs) * 100
  }

  return (
    <div className="bench-result">
      <div className="bench-row">
        <span className="bench-row-label bench-row-label--wasm">WASM</span>
        <div className="bench-bar-wrap">
          <div
            className={`bench-bar bench-bar--wasm${fastest === 'wasm' ? ' bench-bar--winner' : ''}`}
            style={{ width: `${barPct(wasmMs)}%` }}
          />
        </div>
        <span className="bench-row-time">{wasmMs.toFixed(2)} ms</span>
        <span className="bench-row-ops">{msPerOp(wasmMs, iterations)}</span>
      </div>

      <div className="bench-row">
        <span className="bench-row-label bench-row-label--ts">TS</span>
        <div className="bench-bar-wrap">
          <div
            className={`bench-bar bench-bar--ts${fastest === 'ts' ? ' bench-bar--winner' : ''}`}
            style={{ width: `${barPct(tsMs)}%` }}
          />
        </div>
        <span className="bench-row-time">{tsMs.toFixed(2)} ms</span>
        <span className="bench-row-ops">{msPerOp(tsMs, iterations)}</span>
      </div>

      {luaMs !== undefined && (
        <div className="bench-row">
          <span className="bench-row-label bench-row-label--lua">Lua</span>
          <div className="bench-bar-wrap">
            <div
              className={`bench-bar bench-bar--lua${fastest === 'lua' ? ' bench-bar--winner' : ''}`}
              style={{ width: `${barPct(luaMs)}%` }}
            />
          </div>
          <span className="bench-row-time">{luaMs.toFixed(2)} ms</span>
          <span className="bench-row-ops">{msPerOp(luaMs, iterations)}</span>
        </div>
      )}

      <p className="bench-summary">
        <span className={`bench-winner bench-winner--${fastest}`}>
          {fastest.toUpperCase()}
        </span>{' '}
        is {ratioLabel} over {iterations.toLocaleString()} iterations
      </p>
    </div>
  )
}

// ── Worker result display ─────────────────────────────────────────────────────

function WorkerBenchResult({
  result,
  singleThreaded,
}: {
  result: WorkerBenchmarkResult
  singleThreaded: BenchmarkResult | null
}) {
  const { wallMs, totalWasmMs, totalTsMs, totalLuaMs, iterations, workerCount } = result

  // Find fastest among available variants (CPU time)
  const times: { key: 'wasm' | 'ts' | 'lua'; ms: number }[] = [
    { key: 'wasm', ms: totalWasmMs },
    { key: 'ts',   ms: totalTsMs },
    ...(totalLuaMs !== undefined ? [{ key: 'lua' as const, ms: totalLuaMs }] : []),
  ]
  const slowestMs  = Math.max(...times.map((t) => t.ms))
  const fastestMs  = Math.min(...times.map((t) => t.ms))
  const fastest    = times.find((t) => t.ms === fastestMs)!.key
  const ratio      = slowestMs / fastestMs
  const ratioLabel = ratio < 1.02 ? 'roughly equal' : `${ratio.toFixed(2)}× faster`

  function barPct(ms: number) { return (ms / slowestMs) * 100 }

  // Parallel speedup: wall-clock vs combined single-threaded time (WASM + TS + Lua if present)
  const singleMs = singleThreaded
    ? singleThreaded.wasmMs + singleThreaded.tsMs + (singleThreaded.luaMs ?? 0)
    : null
  const parallelSpeedup = singleMs != null ? singleMs / wallMs : null

  return (
    <div className="bench-result">
      <div className="bench-row">
        <span className="bench-row-label bench-row-label--wasm">WASM</span>
        <div className="bench-bar-wrap">
          <div
            className={`bench-bar bench-bar--wasm${fastest === 'wasm' ? ' bench-bar--winner' : ''}`}
            style={{ width: `${barPct(totalWasmMs)}%` }}
          />
        </div>
        <span className="bench-row-time">{totalWasmMs.toFixed(2)} ms</span>
        <span className="bench-row-ops">{msPerOp(totalWasmMs, iterations)}</span>
      </div>

      <div className="bench-row">
        <span className="bench-row-label bench-row-label--ts">TS</span>
        <div className="bench-bar-wrap">
          <div
            className={`bench-bar bench-bar--ts${fastest === 'ts' ? ' bench-bar--winner' : ''}`}
            style={{ width: `${barPct(totalTsMs)}%` }}
          />
        </div>
        <span className="bench-row-time">{totalTsMs.toFixed(2)} ms</span>
        <span className="bench-row-ops">{msPerOp(totalTsMs, iterations)}</span>
      </div>

      {totalLuaMs !== undefined && (
        <div className="bench-row">
          <span className="bench-row-label bench-row-label--lua">Lua</span>
          <div className="bench-bar-wrap">
            <div
              className={`bench-bar bench-bar--lua${fastest === 'lua' ? ' bench-bar--winner' : ''}`}
              style={{ width: `${barPct(totalLuaMs)}%` }}
            />
          </div>
          <span className="bench-row-time">{totalLuaMs.toFixed(2)} ms</span>
          <span className="bench-row-ops">{msPerOp(totalLuaMs, iterations)}</span>
        </div>
      )}

      <p className="bench-summary">
        <span className={`bench-winner bench-winner--${fastest}`}>
          {fastest.toUpperCase()}
        </span>{' '}
        is {ratioLabel} (CPU time) ·{' '}
        <span className="bench-wall-time">
          {wallMs.toFixed(0)} ms wall-clock
        </span>{' '}
        across {workerCount} worker{workerCount !== 1 ? 's' : ''} ·{' '}
        {iterations.toLocaleString()} iters
      </p>

      {parallelSpeedup !== null && (
        <p className="bench-summary bench-speedup">
          <span className="bench-speedup-label">Parallel speedup</span>
          {parallelSpeedup >= 1
            ? ` ${parallelSpeedup.toFixed(2)}× faster wall-clock than single-threaded`
            : ` ${(1 / parallelSpeedup).toFixed(2)}× slower wall-clock than single-threaded`}
          {' '}(vs {(singleMs!).toFixed(2)} ms combined single-threaded)
        </p>
      )}
    </div>
  )
}
