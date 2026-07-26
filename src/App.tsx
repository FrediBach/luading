import { useState, useEffect } from 'react'
import { loadWasm, type WasmExports } from './as/wasm'
import { BenchmarkRunner } from './as/BenchmarkRunner'
import { LuaPlayground } from './lua/LuaPlayground'
import { DistingPlayground } from './disting/DistingPlayground'
import './App.css'

function WasmPlayground() {
  const [wasm, setWasm] = useState<WasmExports | null>(null)
  const [a, setA] = useState(3)
  const [b, setB] = useState(4)
  const [fibN, setFibN] = useState(10)

  useEffect(() => {
    loadWasm().then(setWasm)
  }, [])

  return (
    <main className="playground-root">

      {/* ── AssemblyScript ── */}
      <section className="playground-section">
        <h1>AssemblyScript</h1>
        <p className="playground-desc">
          TypeScript-like language compiled to WebAssembly via{' '}
          <code>src/as/assembly/index.ts</code>.
        </p>

        {!wasm ? (
          <p className="playground-loading">Loading WebAssembly…</p>
        ) : (
          <>
            <div className="as-demos">
              <div className="as-demo">
                <h2>add(a, b)</h2>
                <div className="as-row">
                  <input
                    type="number"
                    value={a}
                    onChange={(e) => setA(Number(e.target.value))}
                    className="as-input"
                  />
                  <span>+</span>
                  <input
                    type="number"
                    value={b}
                    onChange={(e) => setB(Number(e.target.value))}
                    className="as-input"
                  />
                  <span>=</span>
                  <strong>{wasm.add(a, b)}</strong>
                </div>
              </div>

              <div className="as-demo">
                <h2>fibonacci(n)</h2>
                <div className="as-row">
                  <span>n =</span>
                  <input
                    type="number"
                    min={0}
                    max={46}
                    value={fibN}
                    onChange={(e) => setFibN(Number(e.target.value))}
                    className="as-input"
                  />
                  <span>=</span>
                  <strong>{wasm.fibonacci(fibN)}</strong>
                </div>
              </div>
            </div>

            <h2 style={{ marginTop: '2rem' }}>Performance</h2>
            <p className="playground-desc" style={{ marginBottom: '1rem' }}>
              Each function is run N times. A{' '}
              <span style={{ fontFamily: 'var(--mono)' }}>{50}</span>-iteration
              warmup runs first to let the JS engine JIT-compile before timing starts.
            </p>
            <BenchmarkRunner wasm={wasm} />
          </>
        )}
      </section>

      <div className="playground-divider" />

      {/* ── Lua ── */}
      <section className="playground-section">
        <h1>Lua</h1>
        <p className="playground-desc">
          Lua 5.4 VM running in WebAssembly via{' '}
          <a href="https://github.com/ceifa/wasmoon" target="_blank" rel="noreferrer">
            wasmoon
          </a>
          . Edit and run live.
        </p>
        <LuaPlayground />
      </section>

    </main>
  )
}

function App() {
  if (window.location.pathname === '/disting' || window.location.pathname.startsWith('/disting/')) {
    return <DistingPlayground />
  }

  return <WasmPlayground />
}

export default App
