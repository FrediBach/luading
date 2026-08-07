/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { callbackOutputEntries } from '../emulation/callback-output'
import { DistingDisplayApi } from '../emulation/display-api'
import { findFirstTextOverflow } from '../emulation/display-bounds'
import {
  describeProgram,
  type LuaInitResult,
  type LuaProgramRuntime,
} from '../emulation/lua-contract'
import { loadLuaProgramRuntime } from '../emulation/lua-runtime'
import { createDistingLuaTestEngine } from '../testing/lua-test-environment'

const source = readFileSync(
  join(process.cwd(), 'lua-scripts/fredi-bach/Trigger Scene Selector.lua'),
  'utf8',
)

const SCENES = [1, 2, 3, 4, 5, 6, 7, 8, -1]
const engines: Awaited<ReturnType<typeof createDistingLuaTestEngine>>[] = []

function outputVoltages(value: unknown) {
  return Object.fromEntries(callbackOutputEntries(value) ?? []) as Record<number, number>
}

async function createHarness(parameters = SCENES) {
  const lua = await createDistingLuaTestEngine(50)
  engines.push(lua)
  const display = new DistingDisplayApi()
  display.register(lua.global)
  const runtime = await loadLuaProgramRuntime(lua, source)
  runtime.configure(1, 0)
  const rawInit = runtime.init?.()
  const init = rawInit && typeof rawInit === 'object'
    ? rawInit as LuaInitResult
    : {}
  const program = describeProgram(runtime.program, init)
  runtime.setParameters([...parameters])
  return { display, program, runtime }
}

function gate(runtime: LuaProgramRuntime, input: number, rising: boolean) {
  return outputVoltages(runtime.gate?.(input, rising))
}

afterEach(() => {
  while (engines.length > 0) engines.pop()?.global.close()
})

describe('Trigger Scene Selector', () => {
  it('declares three selector inputs, three CV outputs, and a trigger sum', async () => {
    const { program } = await createHarness()

    expect(program.inputCount).toBe(3)
    expect(program.outputCount).toBe(4)
    expect(program.inputNames).toEqual(['Trig 1', 'Trig 2', 'Trig 3'])
    expect(program.outputNames).toEqual(['CV A', 'CV B', 'CV C', 'Trigger Sum'])
    expect(program.parameters.map((parameter) => parameter.name)).toEqual([
      'Scene 1 CV A', 'Scene 1 CV B', 'Scene 1 CV C',
      'Scene 2 CV A', 'Scene 2 CV B', 'Scene 2 CV C',
      'Scene 3 CV A', 'Scene 3 CV B', 'Scene 3 CV C',
    ])
  })

  it('uses input priority and holds the last scene after all gates fall', async () => {
    const { runtime } = await createHarness()

    expect(outputVoltages(runtime.step?.(0.001, [0, 0, 0]))).toEqual({
      1: 1, 2: 2, 3: 3, 4: 0,
    })
    expect(gate(runtime, 3, true)).toEqual({1: 7, 2: 8, 3: -1, 4: 5})
    expect(gate(runtime, 2, true)).toEqual({1: 4, 2: 5, 3: 6, 4: 5})
    expect(gate(runtime, 1, true)).toEqual({1: 1, 2: 2, 3: 3, 4: 5})
    expect(gate(runtime, 1, false)).toEqual({1: 4, 2: 5, 3: 6, 4: 5})
    expect(gate(runtime, 2, false)).toEqual({1: 7, 2: 8, 3: -1, 4: 5})
    expect(gate(runtime, 3, false)).toEqual({1: 7, 2: 8, 3: -1, 4: 0})
  })

  it('applies parameter edits to the latched scene without another edge', async () => {
    const { runtime } = await createHarness()
    gate(runtime, 2, true)
    gate(runtime, 2, false)
    runtime.setParameters([1, 2, 3, -2.5, 0.25, 6.75, 7, 8, -1])

    expect(outputVoltages(runtime.step?.(0.001, [0, 0, 0]))).toEqual({
      1: -2.5, 2: 0.25, 3: 6.75, 4: 0,
    })
  })

  it('draws all scenes and the summed-gate state without text overflow', async () => {
    const { display, runtime } = await createHarness()
    gate(runtime, 2, true)
    display.reset()

    expect(runtime.draw?.()).toBe(true)
    const text = display.commands
      .filter((command) => command.kind === 'text')
      .map((command) => command.text)

    expect(text).toEqual(expect.arrayContaining([
      'TRIGGER SCENES', 'SUM HIGH', 'CV A', 'CV B', 'CV C',
      '+1.00', '+5.00', '-1.00',
    ]))
    expect(findFirstTextOverflow(display.commands)).toBeUndefined()
  })
})
