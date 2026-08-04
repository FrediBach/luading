/// <reference types="node" />

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { callbackOutputEntries } from '../emulation/callback-output'
import {
  describeProgram,
  type LuaInitResult,
} from '../emulation/lua-contract'
import { loadLuaProgramRuntime, registerLuaModules } from '../emulation/lua-runtime'
import { LUA_SCRIPT_PARAMETER_OFFSET } from '../emulation/parameter-model'
import { serialiseJsonState } from '../emulation/runtime-helpers'
import { createDistingLuaTestEngine } from '../testing/lua-test-environment'

describe('bundled community scripts', () => {
  it('loads and exercises every lifecycle callback without boundary failures', async () => {
    const root = join(process.cwd(), 'lua-scripts/fredi-bach')
    const moduleRoot = join(root, 'lib')
    const modules = Object.fromEntries(
      readdirSync(moduleRoot)
        .filter((name) => name.endsWith('.lua'))
        .map((name) => [
          name.slice(0, -4),
          readFileSync(join(moduleRoot, name), 'utf8'),
        ]),
    )
    const failures: string[] = []
    const filenames = readdirSync(root).filter((name) => name.endsWith('.lua')).sort()

    for (const filename of filenames) {
      const lua = await createDistingLuaTestEngine(50)
      try {
        await registerLuaModules(lua, modules)
        const runtime = await loadLuaProgramRuntime(
          lua,
          readFileSync(join(root, filename), 'utf8'),
        )
        if (!runtime.program || typeof runtime.program !== 'object') {
          failures.push(`${filename}:script did not return a table`)
          continue
        }

        runtime.configure(1, LUA_SCRIPT_PARAMETER_OFFSET)
        const rawInit = runtime.init?.()
        const init = rawInit && typeof rawInit === 'object'
          ? rawInit as LuaInitResult
          : {}
        const program = describeProgram(runtime.program, init)
        runtime.setParameters(program.parameters.map((parameter) => parameter.value))

        const checkOutput = (callback: string, value: unknown) => {
          if (callbackOutputEntries(value) === null) {
            failures.push(`${filename}:${callback} returned a non-table value`)
          }
        }

        program.inputKinds.forEach((kind, index) => {
          if (kind === 'trigger' && runtime.trigger) {
            checkOutput('trigger', runtime.trigger(index + 1))
          }
          if (kind === 'gate' && runtime.gate) {
            checkOutput('gate-rise', runtime.gate(index + 1, true))
            checkOutput('gate-fall', runtime.gate(index + 1, false))
          }
        })
        if (runtime.step) {
          checkOutput(
            'step',
            runtime.step(0.001, Array.from({ length: program.inputCount }, () => 0)),
          )
        }
        runtime.ui?.()
        runtime.setupUi?.()
        runtime.draw?.()
        runtime.midiMessage?.([0x90, 60, 100])

        if (runtime.serialise) {
          const result = serialiseJsonState(runtime.serialise())
          if (result.error) failures.push(`${filename}:serialise was not JSON-friendly`)
        }
      } catch (error) {
        failures.push(`${filename}:${error instanceof Error ? error.message : String(error)}`)
      } finally {
        lua.global.close()
      }
    }

    expect(filenames).toHaveLength(42)
    expect(failures).toEqual([])
  }, 20_000)
})
