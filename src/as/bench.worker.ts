// Web Worker that runs a single benchmark slice (WASM + TS, and optionally Lua)
// and posts the result back.
//
// Protocol
// --------
// Incoming (main → worker):
//   { fn: 'add' | 'fibonacci' | 'matMul', arg: number, iterations: number, wasmUrl: string }
//
// Outgoing (worker → main):
//   { wasmMs: number, tsMs: number, luaMs?: number }   on success
//   { error: string }                                   on failure

import { instantiate } from './build/assembly.js'
import { add as tsAdd, fibonacci as tsFibonacci, matMul as tsMatMul } from './assembly'
import { LuaFactory } from 'wasmoon'

// ── Types ─────────────────────────────────────────────────────────────────────

type FnName = 'add' | 'fibonacci' | 'matMul'

interface WorkerRequest {
  fn: FnName
  arg: number
  iterations: number
  wasmUrl: string
}

interface WorkerResult {
  wasmMs: number
  tsMs: number
  luaMs?: number
}

interface WorkerError {
  error: string
}

// ── TS implementations keyed by name ──────────────────────────────────────────

const tsImpls: Record<FnName, (arg: number) => number> = {
  add:       (n) => tsAdd(n, n),
  fibonacci: (n) => tsFibonacci(n),
  matMul:    (n) => tsMatMul(n),
}

// ── Benchmark runners ─────────────────────────────────────────────────────────

const WARMUP_ITERATIONS = 50

function runBench(fn: (arg: number) => number, arg: number, iterations: number): number {
  for (let i = 0; i < WARMUP_ITERATIONS; i++) fn(arg)
  const start = performance.now()
  for (let i = 0; i < iterations; i++) fn(arg)
  return performance.now() - start
}

const luaFactory = new LuaFactory()

async function runLuaBench(n: number, iterations: number): Promise<number> {
  const lua = await luaFactory.createEngine()
  try {
    lua.global.set('print', () => {})

    await lua.doString(`
      local function fib(n)
        if n <= 1 then return n end
        local a, b = 0, 1
        for _ = 2, n do a, b = b, a + b end
        return b
      end
      for _ = 1, ${WARMUP_ITERATIONS} do fib(${n}) end
    `)

    const start = performance.now()
    await lua.doString(`
      local function fib(n)
        if n <= 1 then return n end
        local a, b = 0, 1
        for _ = 2, n do a, b = b, a + b end
        return b
      end
      for _ = 1, ${iterations} do fib(${n}) end
    `)
    return performance.now() - start
  } finally {
    lua.global.close()
  }
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { fn, arg, iterations, wasmUrl } = event.data

  try {
    // Load and instantiate the AssemblyScript WASM binary independently in this worker
    const wasmModule = await WebAssembly.compileStreaming(fetch(wasmUrl))
    const exports = (await instantiate(wasmModule, { env: {} })) as unknown as Record<string, (a: number, b?: number) => number>

    const wasmImpl: (arg: number) => number =
      fn === 'add'
        ? (n) => exports.add(n, n)
        : (n) => (exports[fn] as (a: number) => number)(n)

    const wasmMs = runBench(wasmImpl, arg, iterations)
    const tsMs   = runBench(tsImpls[fn], arg, iterations)

    // Lua variant — only for fibonacci
    const luaMs = fn === 'fibonacci' ? await runLuaBench(arg, iterations) : undefined

    const result: WorkerResult = { wasmMs, tsMs, luaMs }
    self.postMessage(result)
  } catch (err) {
    const errorResult: WorkerError = { error: String(err) }
    self.postMessage(errorResult)
  }
}
