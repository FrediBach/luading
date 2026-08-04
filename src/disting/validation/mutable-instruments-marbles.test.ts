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
import type { DrawCommand } from '../types'

const source = readFileSync(
  join(process.cwd(), 'lua-scripts/fredi-bach/Mutable Instruments Marbles.lua'),
  'utf8',
)

const DEFAULT_PARAMETERS = [
  1, 120, 2, 0, 0, 1, 50, 0, 2,
  1, 2, 70, 0, 0, 1, 2, -100, 8, 1, 3, 70, 0, -80,
]

const engines: Awaited<ReturnType<typeof createDistingLuaTestEngine>>[] = []

function voltages(value: unknown) {
  return Object.fromEntries(callbackOutputEntries(value) ?? []) as Record<number, number>
}

function advance(
  runtime: LuaProgramRuntime,
  milliseconds: number,
  inputs: number[] = Array.from({ length: 11 }, () => 0),
) {
  let result: unknown
  for (let index = 0; index < milliseconds; index += 1) {
    result = runtime.step?.(0.001, inputs)
  }
  return voltages(result)
}

async function createHarness(
  parameters = DEFAULT_PARAMETERS,
  restoredState?: unknown,
) {
  const lua = await createDistingLuaTestEngine(50)
  engines.push(lua)
  const display = new DistingDisplayApi()
  display.register(lua.global)
  const runtime = await loadLuaProgramRuntime(lua, source)
  runtime.configure(1, 0)
  if (restoredState !== undefined) runtime.setState(restoredState)
  const rawInit = runtime.init?.()
  const init = rawInit && typeof rawInit === 'object'
    ? rawInit as LuaInitResult
    : {}
  const program = describeProgram(runtime.program, init)
  runtime.setParameters([...parameters])
  return { display, program, runtime }
}

function withParameters(changes: Record<number, number>) {
  const parameters = [...DEFAULT_PARAMETERS]
  Object.entries(changes).forEach(([oneBasedIndex, value]) => {
    parameters[Number(oneBasedIndex) - 1] = value
  })
  return parameters
}

function frameText(commands: DrawCommand[]) {
  return commands
    .filter((command) => command.kind === 'text')
    .map((command) => command.text)
}

afterEach(() => {
  while (engines.length > 0) engines.pop()?.global.close()
})

describe('Mutable Instruments Marbles recreation', () => {
  it('declares panel-style clocks and CV controls with seven t/X/Y outputs', async () => {
    const { program } = await createHarness()

    expect(program.inputCount).toBe(11)
    expect(program.outputCount).toBe(7)
    expect(program.inputNames).toEqual([
      't Clock', 'X Clock', 'Reset', 'Deja CV', 'Rate CV', 't Bias CV',
      'Jitter CV', 'Spread CV', 'X Bias CV', 'Steps CV', 'External CV',
    ])
    expect(program.outputNames).toEqual(['t1', 't2', 't3', 'X1', 'X2', 'X3', 'Y'])
    expect(program.parameters).toHaveLength(23)
    expect(program.parameters.map((parameter) => parameter.name)).toEqual([
      't Clock', 'Rate', 'Rate range', 'Jitter', 't Bias', 't Mode',
      'Gate length', 'Gate variation', 't Deja vu', 'X Clock', 'X Range',
      'Spread', 'X Bias', 'Steps', 'X Mode', 'X Deja vu', 'Deja vu',
      'Length', 'External process', 'Y Division', 'Y Spread', 'Y Bias',
      'Y Steps',
    ])
  })

  it('uses t bias to route every coin-mode clock to t1 while t2 remains the master gate', async () => {
    const { runtime } = await createHarness(withParameters({
      1: 2,
      5: 100,
      7: 10,
      10: 3,
    }))

    expect(voltages(runtime.trigger?.(1))).toMatchObject({ 1: 5, 2: 5, 3: 0 })
    expect(advance(runtime, 49)).toMatchObject({ 1: 5, 2: 5, 3: 0 })
    expect(advance(runtime, 2)).toMatchObject({ 1: 0, 2: 5, 3: 0 })
    expect(advance(runtime, 200)[2]).toBe(0)
  })

  it('locks each X decision stream into its own three-value loop', async () => {
    const { runtime } = await createHarness(withParameters({
      1: 2,
      10: 3,
      14: 0,
      16: 2,
      17: 0,
      18: 3,
    }))

    const frames: number[][] = []
    for (let index = 0; index < 6; index += 1) {
      runtime.trigger?.(2)
      const output = advance(runtime, 1)
      frames.push([output[4], output[5], output[6]])
    }

    expect(frames.slice(3)).toEqual(frames.slice(0, 3))
    expect(new Set(frames.flat()).size).toBeGreaterThan(1)
  })

  it('restarts locked X sequence positions without erasing their decisions', async () => {
    const { runtime } = await createHarness(withParameters({
      1: 2,
      10: 3,
      17: 0,
      18: 3,
    }))

    const firstCycle: number[] = []
    for (let index = 0; index < 3; index += 1) {
      runtime.trigger?.(2)
      firstCycle.push(advance(runtime, 1)[5])
    }
    runtime.trigger?.(2)
    advance(runtime, 1)
    runtime.trigger?.(3)
    runtime.trigger?.(2)

    expect(advance(runtime, 1)[5]).toBe(firstCycle[0])
  })

  it('quantizes fully stepped X voltages to root octaves inside the bipolar range', async () => {
    const { runtime } = await createHarness(withParameters({
      1: 2,
      10: 3,
      11: 3,
      14: 100,
      16: 1,
    }))

    for (let index = 0; index < 24; index += 1) {
      runtime.trigger?.(2)
      const output = advance(runtime, 1)
      for (const channel of [4, 5, 6]) {
        expect(output[channel]).toBeGreaterThanOrEqual(-5)
        expect(output[channel]).toBeLessThanOrEqual(5)
        expect(output[channel]).toBeCloseTo(Math.round(output[channel]), 8)
      }
    }
  })

  it('slews negative-Steps X targets instead of jumping at the clock edge', async () => {
    const { runtime } = await createHarness(withParameters({
      1: 2,
      10: 3,
      11: 3,
      14: -100,
      16: 1,
    }))

    runtime.trigger?.(2)
    const early = advance(runtime, 1)[5]
    const later = advance(runtime, 500)[5]

    expect(Math.abs(early)).toBeLessThan(0.01)
    expect(Math.abs(later)).toBeGreaterThan(Math.abs(early))
    expect(Math.abs(later)).toBeLessThanOrEqual(5)
  })

  it('round-trips the decision loops through Disting preset state', async () => {
    const parameters = withParameters({ 1: 2, 10: 3, 17: 0, 18: 4 })
    const first = await createHarness(parameters)
    for (let index = 0; index < 5; index += 1) {
      first.runtime.trigger?.(2)
      advance(first.runtime, 1)
    }
    const saved = first.runtime.serialise?.()

    const restored = await createHarness(parameters, saved)
    expect(restored.runtime.serialise?.()).toEqual(saved)
  })

  it('renders the clock, deja-vu state, and three X voltages inside the display', async () => {
    const { display, runtime } = await createHarness()
    advance(runtime, 1)
    display.reset()

    expect(runtime.draw?.()).toBe(true)
    const commands = [...display.commands]
    expect(frameText(commands)).toEqual(expect.arrayContaining([
      'MARBLES', '120', 't', 'COIN', 'D-100', 'L8', 'X', 'STREAM',
      'X1', 'X2', 'X3',
    ]))
    expect(findFirstTextOverflow(commands)).toBeUndefined()
  })
})
