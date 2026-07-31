import {
  LuaEventMasks,
  LuaReturn,
  LuaTimeoutError,
  LuaType,
  type LuaGlobal,
} from 'wasmoon'
import type { LuaProgramRuntime } from './lua-contract'

const CALLBACK_TIMEOUT_MS = 25
const INSTRUCTION_HOOK_COUNT = 1000
const INVOKE_GLOBAL = '__distingInvoke'
const COMPILE_GLOBAL = '__distingCompileOnly'

type LuaGlobals = {
  get?(name: string): unknown
  set(name: string, value: unknown): void
}

export type LuaEngineLike = {
  global: LuaGlobals
  doString(source: string): Promise<unknown>
}

type CallbackEngine = LuaEngineLike & {
  global: LuaGlobal
}

type CallbackInvoker = {
  call(operation: string, ...args: unknown[]): unknown
  close(): void
}

const activeRuntimeCleanups = new WeakMap<object, () => void>()
const callbackTimeoutOverrides = new WeakMap<object, number>()
const compileFunctions = new WeakMap<object, Promise<(source: string, chunkName: string) => unknown>>()

export function configureLuaCallbackTimeout(
  lua: LuaEngineLike,
  timeoutMs: number,
) {
  callbackTimeoutOverrides.set(lua, timeoutMs)
}

/**
 * Compile a text chunk with the simulator's Lua runtime without executing the
 * returned function. A null result means the source compiled successfully.
 */
export async function compileLuaSource(
  lua: LuaEngineLike,
  source: string,
  chunkName = '@script.lua',
): Promise<string | null> {
  let compilerPromise = compileFunctions.get(lua)
  if (!compilerPromise && lua.global.get) {
    compilerPromise = (async () => {
      await lua.doString(`
        _G.${COMPILE_GLOBAL} = function(source, chunkName)
          local compiledChunk, loadError = load(source, chunkName, "t")
          compiledChunk = nil
          collectgarbage("step")
          return loadError
        end
      `)
      const compiler = lua.global.get?.(COMPILE_GLOBAL)
      if (typeof compiler !== 'function') {
        throw new Error('The Lua compile-only helper is unavailable.')
      }
      return compiler as (compileSource: string, compileName: string) => unknown
    })()
    compileFunctions.set(lua, compilerPromise)
  }

  if (compilerPromise) {
    const errorMessage = (await compilerPromise)(source, chunkName)
    return typeof errorMessage === 'string' ? errorMessage : null
  }

  // Minimal deterministic harnesses may expose only `set` and `doString`.
  // The production Wasmoon engine takes the reusable callable path above.
  lua.global.set('__distingCompileSource', source)
  lua.global.set('__distingCompileName', chunkName)
  try {
    const errorMessage = await lua.doString(`
      local _, loadError = load(
        __distingCompileSource,
        __distingCompileName,
        "t"
      )
      return loadError
    `)
    return typeof errorMessage === 'string' ? errorMessage : null
  } finally {
    lua.global.set('__distingCompileSource', undefined)
    lua.global.set('__distingCompileName', undefined)
  }
}

function supportsCallbackThread(lua: LuaEngineLike): lua is CallbackEngine {
  const global = lua.global as Partial<LuaGlobal>
  return typeof global.newThread === 'function'
    && typeof global.getTop === 'function'
    && typeof global.remove === 'function'
}

function createCallbackInvoker(
  lua: CallbackEngine,
  timeoutMs: number,
): CallbackInvoker {
  const callbackThread = lua.global.newThread()
  const callbackThreadIndex = lua.global.getTop()
  let deadline = 0
  let closed = false
  const hookPointer = callbackThread.lua.module.addFunction(() => {
    if (Date.now() <= deadline) return
    callbackThread.pushValue(new LuaTimeoutError('thread timeout exceeded'))
    callbackThread.lua.lua_error(callbackThread.address)
  }, 'vii')

  return {
    call(operation, ...args) {
      if (closed) throw new Error('Tried to call a closed Lua program runtime')

      callbackThread.setTop(0)
      const invokeType = callbackThread.lua.lua_getglobal(
        callbackThread.address,
        INVOKE_GLOBAL,
      )
      if (invokeType !== LuaType.Function) {
        callbackThread.setTop(0)
        throw new Error('The Lua program callback dispatcher is unavailable.')
      }

      callbackThread.pushValue(operation)
      for (const argument of args) callbackThread.pushValue(argument)
      deadline = Date.now() + timeoutMs
      callbackThread.lua.lua_sethook(
        callbackThread.address,
        hookPointer,
        LuaEventMasks.Count,
        INSTRUCTION_HOOK_COUNT,
      )

      try {
        const status = callbackThread.lua.lua_pcallk(
          callbackThread.address,
          args.length + 1,
          1,
          0,
          0,
          null,
        )
        if (status === LuaReturn.Yield) {
          throw new Error('cannot yield in callbacks from javascript')
        }
        callbackThread.assertOk(status)
        return callbackThread.getTop() > 0
          ? callbackThread.getValue(-1)
          : undefined
      } finally {
        callbackThread.lua.lua_sethook(callbackThread.address, null, 0, 0)
        callbackThread.setTop(0)
      }
    },
    close() {
      if (closed) return
      closed = true
      callbackThread.lua.lua_sethook(callbackThread.address, null, 0, 0)
      callbackThread.lua.module.removeFunction(hookPointer)
      callbackThread.close()
      lua.global.remove(callbackThreadIndex)
    },
  }
}

export async function registerLuaModules(
  lua: LuaEngineLike,
  modules: Record<string, string>,
) {
  for (const [name, source] of Object.entries(modules)) {
    lua.global.set('__distingModuleSource', source)
    lua.global.set('__distingModuleName', `@lib/${name}.lua`)
    lua.global.set('__distingModuleKey', name)
    await lua.doString(`
      package.preload[__distingModuleKey] =
        assert(load(__distingModuleSource, __distingModuleName, "t"))
    `)
  }

  lua.global.set('__distingModuleSource', undefined)
  lua.global.set('__distingModuleName', undefined)
  lua.global.set('__distingModuleKey', undefined)
}

export async function loadLuaProgramRuntime(
  lua: LuaEngineLike,
  source: string,
): Promise<LuaProgramRuntime> {
  activeRuntimeCleanups.get(lua)?.()
  activeRuntimeCleanups.delete(lua)
  lua.global.set('__distingProgramSource', source)

  try {
    const rawRuntime = await lua.doString(`
      local chunk, loadError = load(__distingProgramSource, "@script.lua", "t")
      if not chunk then error(loadError, 0) end
      local program = chunk()
      if type(program) ~= "table" then
        return { program = program }
      end
      local runtime = { program = program }
      runtime.configure = function(algorithmIndex, parameterOffset)
        program.algorithmIndex = algorithmIndex
        program.parameterOffset = parameterOffset
      end
      runtime.setParameters = function(...)
        program.parameters = {...}
      end
      runtime.setParameter = function(index, value)
        program.parameters[index] = value
      end
      runtime.setState = function(state)
        program.state = state
      end
      runtime.callUi = function(callback, value)
        local fn = program[callback]
        if type(fn) ~= "function" then return nil end
        if value == nil then return fn(program) end
        return fn(program, value)
      end
      if type(program.init) == "function" then
        runtime.init = function() return program:init() end
      end
      if type(program.step) == "function" then
        local inputs = {}
        local previousInputCount = 0
        runtime.step = function(dt, ...)
          local inputCount = select("#", ...)
          for index = 1, inputCount do
            inputs[index] = select(index, ...)
          end
          for index = inputCount + 1, previousInputCount do
            inputs[index] = nil
          end
          previousInputCount = inputCount
          return program:step(dt, inputs)
        end
      end
      if type(program.trigger) == "function" then
        runtime.trigger = function(input) return program:trigger(input) end
      end
      if type(program.gate) == "function" then
        runtime.gate = function(input, rising) return program:gate(input, rising) end
      end
      if type(program.draw) == "function" then
        runtime.draw = function() return program:draw() end
      end
      if type(program.ui) == "function" then
        runtime.ui = function() return program:ui() end
      end
      if type(program.setupUi) == "function" then
        runtime.setupUi = function() return program:setupUi() end
      end
      if type(program.midiMessage) == "function" then
        runtime.midiMessage = function(...) return program:midiMessage({...}) end
      end
      if type(program.serialise) == "function" then
        runtime.serialise = function() return program:serialise() end
      end
      _G.${INVOKE_GLOBAL} = function(operation, ...)
        local fn = runtime[operation]
        if type(fn) ~= "function" then return nil end
        return fn(...)
      end
      return runtime
    `) as LuaProgramRuntime

    if (
      !supportsCallbackThread(lua)
      || !rawRuntime.program
      || typeof rawRuntime.program !== 'object'
    ) {
      return rawRuntime
    }

    const invoker = createCallbackInvoker(
      lua,
      callbackTimeoutOverrides.get(lua) ?? CALLBACK_TIMEOUT_MS,
    )
    let closed = false
    const close = () => {
      if (closed) return
      closed = true
      invoker.close()
      if (activeRuntimeCleanups.get(lua) === close) {
        activeRuntimeCleanups.delete(lua)
      }
    }
    activeRuntimeCleanups.set(lua, close)

    return {
      program: rawRuntime.program,
      configure: (algorithmIndex, parameterOffset) => {
        invoker.call('configure', algorithmIndex, parameterOffset)
      },
      setParameters: (parameters) => {
        invoker.call('setParameters', ...parameters)
      },
      setParameter: (index, value) => {
        invoker.call('setParameter', index, value)
      },
      setState: (state) => {
        invoker.call('setState', state)
      },
      callUi: (callback, value) => invoker.call('callUi', callback, value),
      init: typeof rawRuntime.init === 'function'
        ? () => invoker.call('init') as ReturnType<NonNullable<LuaProgramRuntime['init']>>
        : undefined,
      step: typeof rawRuntime.step === 'function'
        ? (dt, inputs) => invoker.call(
            'step',
            dt,
            ...inputs,
          ) as ReturnType<NonNullable<LuaProgramRuntime['step']>>
        : undefined,
      trigger: typeof rawRuntime.trigger === 'function'
        ? (input) => invoker.call(
            'trigger',
            input,
          ) as ReturnType<NonNullable<LuaProgramRuntime['trigger']>>
        : undefined,
      gate: typeof rawRuntime.gate === 'function'
        ? (input, rising) => invoker.call(
            'gate',
            input,
            rising,
          ) as ReturnType<NonNullable<LuaProgramRuntime['gate']>>
        : undefined,
      draw: typeof rawRuntime.draw === 'function'
        ? () => invoker.call('draw')
        : undefined,
      ui: typeof rawRuntime.ui === 'function'
        ? () => invoker.call('ui')
        : undefined,
      setupUi: typeof rawRuntime.setupUi === 'function'
        ? () => invoker.call('setupUi')
        : undefined,
      midiMessage: typeof rawRuntime.midiMessage === 'function'
        ? (message) => invoker.call('midiMessage', ...message)
        : undefined,
      serialise: typeof rawRuntime.serialise === 'function'
        ? () => invoker.call('serialise')
        : undefined,
      close,
    }
  } finally {
    lua.global.set('__distingProgramSource', undefined)
  }
}
