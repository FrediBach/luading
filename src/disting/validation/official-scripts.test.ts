/// <reference types="node" />

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { callbackOutputEntries } from '../emulation/callback-output'
import {
  describeProgram,
  DISTING_CONSTANTS,
  type LuaInitResult,
} from '../emulation/lua-contract'
import {
  loadLuaProgramRuntime,
  registerLuaModules,
} from '../emulation/lua-runtime'
import { LUA_SCRIPT_PARAMETER_OFFSET } from '../emulation/parameter-model'
import { createDistingLuaTestEngine } from '../testing/lua-test-environment'
import { luaSequence, validateProgramContract } from './contract-validator'

describe('bundled Expert Sleepers scripts', () => {
  it('loads every script without contract errors and accepts nil callback returns', async () => {
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
      const lua = await createDistingLuaTestEngine(25)

      await registerLuaModules(lua, modules)
      const runtime = await loadLuaProgramRuntime(
        lua,
        readFileSync(join(root, filename), 'utf8'),
      )

      runtime.configure(1, LUA_SCRIPT_PARAMETER_OFFSET)
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

    expect(actualErrors).toEqual({})
    expect(invalidCallbackReturns).toEqual([])
  }, 15_000)
})
