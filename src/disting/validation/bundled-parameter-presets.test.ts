/// <reference types="node" />

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { describeProgram, type LuaInitResult } from '../emulation/lua-contract'
import { loadLuaProgramRuntime, registerLuaModules } from '../emulation/lua-runtime'
import { LUA_SCRIPT_PARAMETER_OFFSET } from '../emulation/parameter-model'
import {
  matchingParameterPresetIndex,
  parseParameterPresets,
} from '../emulation/parameter-presets'
import { createDistingLuaTestEngine } from '../testing/lua-test-environment'

it('gives every parameterized bundled example multiple valid presets', async () => {
  const collections = ['expert-sleepers', 'fredi-bach']
  const parameterizedScripts: string[] = []
  const failures: string[] = []

  for (const collection of collections) {
    const root = join(process.cwd(), 'lua-scripts', collection)
    const moduleRoot = join(root, 'lib')
    const modules = collection === 'expert-sleepers'
      ? Object.fromEntries(
          readdirSync(moduleRoot)
            .filter((name) => name.endsWith('.lua'))
            .map((name) => [
              name.slice(0, -4),
              readFileSync(join(moduleRoot, name), 'utf8'),
            ]),
        )
      : {}
    const filenames = readdirSync(root).filter((name) => name.endsWith('.lua')).sort()
    for (const filename of filenames) {
      const lua = await createDistingLuaTestEngine(50)
      await registerLuaModules(lua, modules)
      const runtime = await loadLuaProgramRuntime(
        lua,
        readFileSync(join(root, filename), 'utf8'),
      )
      runtime.configure(1, LUA_SCRIPT_PARAMETER_OFFSET)
      const rawInit = runtime.init?.()
      const init = rawInit && typeof rawInit === 'object' ? rawInit as LuaInitResult : {}
      const program = describeProgram(runtime.program, init)
      const script = `${collection}/${filename}`
      const result = parseParameterPresets(runtime.program.luading, program.parameters)

      if (program.parameters.length > 0) {
        parameterizedScripts.push(script)
        if (result.presets.length < 2) failures.push(`${script}:fewer than two presets`)
        const defaultValues = program.parameters.map((parameter) => parameter.value)
        if (matchingParameterPresetIndex(result.presets, defaultValues) === null) {
          failures.push(`${script}:no preset matches parameter defaults`)
        }
      } else if (result.presets.length > 0) {
        failures.push(`${script}:presets declared without parameters`)
      }
      result.diagnostics.forEach((diagnostic) => {
        failures.push(`${script}:${diagnostic.ruleId}`)
      })
      lua.global.close()
    }
  }

  expect(parameterizedScripts.length).toBeGreaterThan(0)
  expect(failures).toEqual([])
}, 20_000)
