import type { LuaProgramRuntime } from './lua-contract'

type LuaGlobals = {
  set(name: string, value: unknown): void
}

export type LuaEngineLike = {
  global: LuaGlobals
  doString(source: string): Promise<unknown>
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
  lua.global.set('__distingProgramSource', source)

  try {
    return await lua.doString(`
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
      runtime.setParameters = function(parameters)
        program.parameters = parameters
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
        runtime.step = function(dt, inputs) return program:step(dt, inputs) end
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
        runtime.midiMessage = function(message) return program:midiMessage(message) end
      end
      if type(program.serialise) == "function" then
        runtime.serialise = function() return program:serialise() end
      end
      return runtime
    `) as LuaProgramRuntime
  } finally {
    lua.global.set('__distingProgramSource', undefined)
  }
}
