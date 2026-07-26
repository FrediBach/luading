import { instantiate } from './build/assembly.js'

export type WasmExports = {
  add: (a: number, b: number) => number
  fibonacci: (n: number) => number
  matMul: (n: number) => number
}

export async function loadWasm(): Promise<WasmExports> {
  const wasmUrl = new URL('./build/assembly.wasm', import.meta.url)
  // Append a timestamp in dev so the browser never serves a stale cached
  // binary after a hot-reload triggered by an AssemblyScript recompile.
  const cacheBust = import.meta.env.DEV ? `?t=${Date.now()}` : ''
  const wasmModule = await WebAssembly.compileStreaming(fetch(wasmUrl.href + cacheBust))
  const exports = await instantiate(wasmModule, { env: {} })
  return exports as WasmExports
}
