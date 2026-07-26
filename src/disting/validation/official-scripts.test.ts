/// <reference types="node" />

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LuaFactory } from 'wasmoon'
import { callbackOutputEntries } from '../emulation/callback-output'
import {
  describeProgram,
  DISTING_CONSTANTS,
  type LuaInitResult,
  type LuaProgramRuntime,
} from '../emulation/lua-contract'
import { DISTING_API } from './api-manifest'
import { luaSequence, validateProgramContract } from './contract-validator'

const EXPECTED_SCRIPT_ERRORS = {
  'ae_random_stepped_voltage.lua': ['parameter-3-default'],
  'clep_disting.lua': ['outputs-type-2'],
  'quad_bernoulli.lua': ['parameter-5-default'],
}

describe('bundled Expert Sleepers scripts', () => {
  it('reports only confirmed contract errors and accepts nil callback returns', async () => {
    const root = join(process.cwd(), 'lua-scripts/expert-sleepers')
    const moduleRoot = join(root, 'lib')
    const modules = Object.fromEntries(
      readdirSync(moduleRoot)
        .filter((name) => name.endsWith('.lua'))
        .map((name) => [name.slice(0, -4), readFileSync(join(moduleRoot, name), 'utf8')]),
    )
    const actualErrors: Record<string, string[]> = {}
    const invalidCallbackReturns: string[] = []

    for (const filename of readdirSync(root).filter((name) => name.endsWith('.lua')).sort()) {
      const lua = await new LuaFactory().createEngine({ functionTimeout: 25 })
      for (const [name, value] of Object.entries(DISTING_CONSTANTS)) lua.global.set(name, value)
      for (const { name } of DISTING_API) lua.global.set(name, () => undefined)
      for (const name of [
        'getCpuCycleCount',
        'getCurrentAlgorithm',
        'getCurrentParameter',
        'getAlgorithmCount',
        'getParameterCount',
        'getParameter',
        'getBusVoltage',
        'findAlgorithm',
        'findParameter',
      ]) lua.global.set(name, () => 1)
      for (const name of ['getAlgorithmName', 'getParameterName']) {
        lua.global.set(name, () => 'Mock')
      }
      lua.global.set('sendI2CGetter', () => [0])

      for (const [name, source] of Object.entries(modules)) {
        lua.global.set('__source', source)
        lua.global.set('__name', `@lib/${name}.lua`)
        lua.global.set('__key', name)
        await lua.doString('package.preload[__key] = assert(load(__source, __name, "t"))')
      }
      lua.global.set('__source', readFileSync(join(root, filename), 'utf8'))
      const runtime = await lua.doString(`
        local program = assert(load(__source, "@script.lua", "t"))()
        local runtime = { program = program }
        runtime.configure = function(algorithmIndex, parameterOffset)
          program.algorithmIndex = algorithmIndex
          program.parameterOffset = parameterOffset
        end
        runtime.setParameters = function(parameters) program.parameters = parameters end
        runtime.setParameter = function(index, value) program.parameters[index] = value end
        runtime.setState = function(state) program.state = state end
        runtime.callUi = function(callback, value)
          local fn = program[callback]
          if type(fn) ~= "function" then return nil end
          if value == nil then return fn(program) end
          return fn(program, value)
        end
        if type(program.init) == "function" then runtime.init = function() return program:init() end end
        if type(program.step) == "function" then runtime.step = function(dt, inputs) return program:step(dt, inputs) end end
        if type(program.trigger) == "function" then runtime.trigger = function(input) return program:trigger(input) end end
        if type(program.gate) == "function" then runtime.gate = function(input, rising) return program:gate(input, rising) end end
        if type(program.draw) == "function" then runtime.draw = function() return program:draw() end end
        return runtime
      `) as LuaProgramRuntime

      runtime.configure(1, 0)
      const rawInit = runtime.init?.()
      const init = (rawInit && typeof rawInit === 'object' ? rawInit : {}) as LuaInitResult
      const described = describeProgram(runtime.program, init)
      runtime.setParameters(described.parameters.map((parameter) => parameter.value))

      const errors = validateProgramContract(runtime.program, rawInit)
        .filter((finding) => finding.severity === 'error')
        .map((finding) => finding.ruleId)
      if (errors.length > 0) actualErrors[filename] = errors

      const inputTypes = luaSequence(init.inputs) ?? []
      const checkResult = (callback: string, value: unknown) => {
        if (callbackOutputEntries(value) === null) {
          invalidCallbackReturns.push(`${filename}:${callback}`)
        }
      }
      inputTypes.forEach((type, index) => {
        if (type === DISTING_CONSTANTS.kTrigger && runtime.trigger) {
          checkResult('trigger', runtime.trigger(index + 1))
        }
        if (type === DISTING_CONSTANTS.kGate && runtime.gate) {
          checkResult('gate', runtime.gate(index + 1, true))
          checkResult('gate', runtime.gate(index + 1, false))
        }
      })
      const inputCount = inputTypes.length || (typeof init.inputs === 'number' ? init.inputs : 0)
      if (runtime.step) {
        checkResult('step', runtime.step(0.001, Array.from({ length: inputCount }, () => 0)))
      }
      lua.global.close()
    }

    expect(actualErrors).toEqual(EXPECTED_SCRIPT_ERRORS)
    expect(invalidCallbackReturns).toEqual([])
  }, 15_000)
})
