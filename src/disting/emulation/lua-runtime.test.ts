import { afterEach, describe, expect, it } from 'vitest'
import { LuaFactory } from 'wasmoon'
import { DISTING_CONSTANTS } from './lua-contract'
import {
  compileLuaSource,
  configureLuaCallbackTimeout,
  loadLuaProgramRuntime,
  registerLuaModules,
  type LuaEngineLike,
} from './lua-runtime'
import { LUA_SCRIPT_PARAMETER_OFFSET } from './parameter-model'

type Engine = Awaited<ReturnType<LuaFactory['createEngine']>>
const engines: Engine[] = []

async function createEngine() {
  const engine = await new LuaFactory().createEngine({ functionTimeout: 50 })
  configureLuaCallbackTimeout(engine, 50)
  engines.push(engine)
  for (const [name, value] of Object.entries(DISTING_CONSTANTS)) {
    engine.global.set(name, value)
  }
  return engine
}

afterEach(() => {
  while (engines.length > 0) engines.pop()?.global.close()
})

describe('Lua program runtime bridge', () => {
  it('compiles text chunks without executing them and clears bridge globals', async () => {
    const lua = await createEngine()
    lua.global.set('__compileOnlyExecuted', false)

    expect(await compileLuaSource(lua, `
      __compileOnlyExecuted = true
      error("compile-only chunks must not run")
    `)).toBeNull()
    expect(lua.global.get('__compileOnlyExecuted')).toBe(false)

    await expect(compileLuaSource(lua, 'return { value = ) }')).resolves.toMatch(
      /script\.lua:1: unexpected symbol near '\)'/,
    )
    expect(lua.global.get('__distingCompileSource')).toBeNull()
    expect(lua.global.get('__distingCompileName')).toBeNull()
  })

  it('binds self and exposes every Disting algorithm callback', async () => {
    const lua = await createEngine()
    const runtime = await loadLuaProgramRuntime(lua, `
      return {
        name = "Lifecycle",
        init = function(self)
          return {
            inputs = { kCV, kTrigger, kGate },
            outputs = { kStepped, kLinear },
            restored = self.state.seed,
          }
        end,
        step = function(self, dt, inputs)
          return { [2] = inputs[1] + self.parameters[1] + dt }
        end,
        trigger = function(self, input) return { input * 2 } end,
        gate = function(self, input, rising) return { rising and input or -input } end,
        draw = function(self) return true end,
        ui = function(self) return true end,
        setupUi = function(self) return { 0.1, 0.5, 0.9 } end,
        pot1Turn = function(self, value) self.pot = value end,
        midiMessage = function(self, message) self.lastMidi = message[1] end,
        serialise = function(self)
          return {
            seed = self.state.seed,
            pot = self.pot,
            midi = self.lastMidi,
            algorithmIndex = self.algorithmIndex,
            parameterOffset = self.parameterOffset,
          }
        end,
      }
    `)

    runtime.configure(4, LUA_SCRIPT_PARAMETER_OFFSET)
    runtime.setState({ seed: 12 })
    runtime.setParameters([3])

    expect(runtime.init?.()).toMatchObject({
      inputs: [0, 2, 1],
      outputs: [0, 1],
      restored: 12,
    })
    expect(runtime.step?.(0.001, [2, 0, 0])).toEqual({ 2: 5.001 })
    expect(runtime.trigger?.(3)).toEqual([6])
    expect(runtime.gate?.(2, true)).toEqual([2])
    expect(runtime.gate?.(2, false)).toEqual([-2])
    expect(runtime.draw?.()).toBe(true)
    expect(runtime.ui?.()).toBe(true)
    expect(runtime.setupUi?.()).toEqual([0.1, 0.5, 0.9])

    runtime.callUi('pot1Turn', 0.75)
    runtime.midiMessage?.([0x91, 64, 100])
    expect(runtime.serialise?.()).toEqual({
      seed: 12,
      pot: 0.75,
      midi: 0x91,
      algorithmIndex: 4,
      parameterOffset: LUA_SCRIPT_PARAMETER_OFFSET,
    })
    expect(runtime.callUi('missing')).toBeNull()
  })

  it('loads required Lua modules through package.preload', async () => {
    const lua = await createEngine()
    await registerLuaModules(lua, {
      oscillator: 'return { voltage = function(x) return x * 5 end }',
    })
    const runtime = await loadLuaProgramRuntime(lua, `
      local oscillator = require("oscillator")
      return {
        step = function(self, dt, inputs)
          return { oscillator.voltage(inputs[1]) }
        end,
      }
    `)

    expect(runtime.step?.(0.001, [0.5])).toEqual([2.5])
  })

  it('reuses one timeout hook across repeated real-time callbacks', async () => {
    const lua = await createEngine()
    const module = lua.global.lua.module
    const originalAddFunction = module.addFunction
    const originalRemoveFunction = module.removeFunction
    let additions = 0
    let removals = 0
    module.addFunction = ((callback, signature) => {
      additions += 1
      return originalAddFunction.call(module, callback, signature)
    }) as typeof module.addFunction
    module.removeFunction = ((pointer) => {
      removals += 1
      return originalRemoveFunction.call(module, pointer)
    }) as typeof module.removeFunction

    const runtime = await loadLuaProgramRuntime(lua, `
      local out = {}
      return {
        step = function(self, dt, inputs)
          out[1] = (inputs[1] or 0) + dt
          return out
        end,
      }
    `)
    const additionsAfterLoad = additions

    for (let index = 0; index < 10_000; index += 1) {
      expect(runtime.step?.(0.001, [index])).toEqual([index + 0.001])
    }

    expect(additionsAfterLoad).toBe(1)
    expect(additions).toBe(additionsAfterLoad)
    runtime.close?.()
    expect(removals).toBe(1)
  })

  it('still interrupts runaway callbacks and can run again afterward', async () => {
    const lua = await createEngine()
    const runtime = await loadLuaProgramRuntime(lua, `
      return {
        step = function(self, dt, inputs)
          if inputs[1] > 0 then
            while true do end
          end
          return { 4 }
        end,
      }
    `)

    expect(() => runtime.step?.(0.001, [1])).toThrow(/thread timeout exceeded/)
    expect(runtime.step?.(0.001, [0])).toEqual([4])
  })

  it('clears source globals after syntax failures', async () => {
    const lua = await createEngine()

    await expect(loadLuaProgramRuntime(lua, 'return { step = function(')).rejects.toThrow(
      /script\.lua/,
    )
    expect(lua.global.get('__distingProgramSource')).toBeNull()
  })

  it('returns the raw non-table program for worker-level validation', async () => {
    const lua = await createEngine()
    const runtime = await loadLuaProgramRuntime(lua, 'return 42')

    expect(runtime.program).toBe(42)
  })

  it('accepts a minimal engine interface for deterministic harnesses', async () => {
    const values = new Map<string, unknown>()
    const fake: LuaEngineLike = {
      global: { set: (name, value) => values.set(name, value) },
      doString: async () => ({ program: {} }),
    }

    await registerLuaModules(fake, {})
    const runtime = await loadLuaProgramRuntime(fake, 'return {}')

    expect(runtime).toEqual({ program: {} })
    expect(values.get('__distingProgramSource')).toBeUndefined()
  })
})
