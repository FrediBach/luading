import { useState, useRef, useCallback, useEffect } from 'react'
import { LuaFactory } from 'wasmoon'

const factory = new LuaFactory()

const DEFAULT_CODE = `-- Lua 5.4 · WebAssembly via wasmoon
-- Toggle "Live" above to rerun on every keystroke and watch the timing.

-- ── 1. Sieve of Eratosthenes ────────────────────────────────────────────────
local function sieve(limit)
  local is_prime = {}
  for i = 2, limit do is_prime[i] = true end
  for i = 2, math.floor(math.sqrt(limit)) do
    if is_prime[i] then
      for j = i * i, limit, i do is_prime[j] = false end
    end
  end
  local primes = {}
  for i = 2, limit do
    if is_prime[i] then primes[#primes + 1] = i end
  end
  return primes
end

local primes = sieve(5000)
print(string.format("Primes up to 5000: %d found, largest = %d", #primes, primes[#primes]))

-- ── 2. Matrix multiplication (pure Lua) ─────────────────────────────────────
local function matmul(A, B, n)
  local C = {}
  for i = 1, n do
    C[i] = {}
    for j = 1, n do
      local s = 0
      for k = 1, n do s = s + A[i][k] * B[k][j] end
      C[i][j] = s
    end
  end
  return C
end

local n = 40
local A, B = {}, {}
for i = 1, n do
  A[i], B[i] = {}, {}
  for j = 1, n do
    A[i][j] = (i + j - 1) % n + 1
    B[i][j] = (i * j) % n + 1
  end
end
local C = matmul(A, B, n)
local checksum = 0
for i = 1, n do for j = 1, n do checksum = checksum + C[i][j] end end
print(string.format("Matrix %dx%d multiply checksum: %d", n, n, checksum))

-- ── 3. Recursive memoised Fibonacci ─────────────────────────────────────────
local memo = {}
local function fib(n)
  if n <= 1 then return n end
  if memo[n] then return memo[n] end
  memo[n] = fib(n - 1) + fib(n - 2)
  return memo[n]
end
-- Print the first 20 Fibonacci numbers
local fibs = {}
for i = 0, 19 do fibs[#fibs + 1] = tostring(fib(i)) end
print("Fibonacci(0..19): " .. table.concat(fibs, ", "))

-- ── 4. String processing ─────────────────────────────────────────────────────
local function caesar(text, shift)
  return (text:gsub("%a", function(c)
    local base = c:match("%l") and 97 or 65
    return string.char((string.byte(c) - base + shift) % 26 + base)
  end))
end

local msg    = "The quick brown fox jumps over the lazy dog"
local enc    = caesar(msg, 13)   -- ROT-13
local dec    = caesar(enc, 13)   -- ROT-13 is its own inverse
print("ROT-13 encode: " .. enc)
print("ROT-13 decode: " .. dec)

-- ── 5. Coroutines ────────────────────────────────────────────────────────────
local function range(from, to, step)
  step = step or 1
  return coroutine.wrap(function()
    for i = from, to, step do coroutine.yield(i) end
  end)
end

local squares = {}
for v in range(1, 10) do squares[#squares + 1] = v * v end
print("Squares 1–10: " .. table.concat(squares, ", "))

-- ── 6. Closure-based OOP ─────────────────────────────────────────────────────
local function Stack()
  local items = {}
  return {
    push = function(v) items[#items + 1] = v end,
    pop  = function()
      if #items == 0 then return nil end
      local v = items[#items]; items[#items] = nil; return v
    end,
    size = function() return #items end,
  }
end

local s = Stack()
for _, p in ipairs(primes) do
  if p > 100 then break end
  s.push(p)
end
local popped = {}
while s.size() > 0 do popped[#popped + 1] = s.pop() end
print("Primes ≤100 popped from stack: " .. table.concat(popped, ", "))
`

const LIVE_DEBOUNCE_MS = 300

type RunState = 'idle' | 'running' | 'done' | 'error'

function fmtDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`
  return `${ms.toFixed(1)} ms`
}

export function LuaPlayground() {
  const [code, setCode] = useState(DEFAULT_CODE)
  const [output, setOutput] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<RunState>('idle')
  const [liveMode, setLiveMode] = useState(false)
  const [execMs, setExecMs] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Generation counter: each run increments it; a run only commits results if
  // its generation still matches the current one when it completes.
  const generationRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const run = useCallback(async (currentCode: string) => {
    const generation = ++generationRef.current
    setState('running')
    setOutput([])
    setError(null)

    const lines: string[] = []
    let lua: Awaited<ReturnType<typeof factory.createEngine>> | null = null

    try {
      lua = await factory.createEngine()

      // Capture print() output instead of writing to console
      lua.global.set('print', (...args: unknown[]) => {
        lines.push(args.map(String).join('\t'))
      })

      const t0 = performance.now()
      await lua.doString(currentCode)
      const elapsed = performance.now() - t0

      if (generationRef.current === generation) {
        setOutput(lines)
        setExecMs(elapsed)
        setState('done')
      }
    } catch (err) {
      if (generationRef.current === generation) {
        setOutput(lines)
        setError(err instanceof Error ? err.message : String(err))
        setExecMs(null)
        setState('error')
      }
    } finally {
      lua?.global.close()
    }
  }, [])

  // Debounced live runner — triggered whenever code changes in live mode
  useEffect(() => {
    if (!liveMode) return

    if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      run(code)
    }, LIVE_DEBOUNCE_MS)

    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    }
  }, [code, liveMode, run])

  // When live mode is turned on, run immediately with current code
  const toggleLive = useCallback(() => {
    setLiveMode((prev) => {
      if (!prev) run(code)
      return !prev
    })
  }, [code, run])

  const handleRun = useCallback(() => run(code), [code, run])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      run(code)
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const el = textareaRef.current!
      const start = el.selectionStart
      const end = el.selectionEnd
      const next = code.slice(0, start) + '  ' + code.slice(end)
      setCode(next)
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2
      })
    }
  }

  return (
    <div className="lua-playground">
      <div className="lua-editor-wrap">
        <textarea
          ref={textareaRef}
          className="lua-editor"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          aria-label="Lua source code"
        />
      </div>

      <div className="lua-toolbar">
        <button
          className="lua-run-btn"
          onClick={handleRun}
          disabled={state === 'running'}
        >
          {state === 'running' ? 'Running…' : 'Run'}
        </button>

        <button
          className={`lua-live-btn${liveMode ? ' lua-live-btn--active' : ''}`}
          onClick={toggleLive}
          title={liveMode ? 'Disable live mode' : 'Enable live mode — reruns on every keystroke'}
        >
          Live
        </button>

        {execMs !== null && state !== 'running' && (
          <span className="lua-timing">
            executed in <strong>{fmtDuration(execMs)}</strong>
          </span>
        )}

        {state !== 'running' && execMs === null && (
          <span className="lua-hint">
            {liveMode ? `reruns ${LIVE_DEBOUNCE_MS} ms after each change` : 'or Ctrl+Enter'}
          </span>
        )}

        {state === 'running' && (
          <span className="lua-hint">running…</span>
        )}
      </div>

      {(output.length > 0 || error) && (
        <div className="lua-output-wrap">
          {output.length > 0 && (
            <pre className="lua-output">{output.join('\n')}</pre>
          )}
          {error && (
            <pre className="lua-error">{error}</pre>
          )}
        </div>
      )}
    </div>
  )
}
