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
import { DISTING_DISPLAY, type DrawCommand } from '../types'

const source = readFileSync(
  join(process.cwd(), 'lua-scripts/fredi-bach/Buchla 266 Source of Uncertainty.lua'),
  'utf8',
)

const DEFAULT_PARAMETERS = [0.5, 2, 3, 0]
const RESTORED_STATE = {
  randomState: 123456,
  fluctuatingA: 5,
  fluctuatingB: 5,
  nPlusOne: 0,
  twoToN: 0,
  storedEqual: 5,
  storedWeighted: 5,
}

const engines: Awaited<ReturnType<typeof createDistingLuaTestEngine>>[] = []

function voltages(value: unknown) {
  return Object.fromEntries(callbackOutputEntries(value) ?? []) as Record<number, number>
}

async function createHarness(
  parameters = DEFAULT_PARAMETERS,
  restoredState: unknown = RESTORED_STATE,
) {
  const lua = await createDistingLuaTestEngine(50)
  engines.push(lua)
  const display = new DistingDisplayApi()
  display.register(lua.global)
  const runtime = await loadLuaProgramRuntime(lua, source)
  runtime.configure(1, 0)
  runtime.setState(restoredState)
  const rawInit = runtime.init?.()
  const init = rawInit && typeof rawInit === 'object'
    ? rawInit as LuaInitResult
    : {}
  const program = describeProgram(runtime.program, init)
  runtime.setParameters([...parameters])
  return { display, program, runtime }
}

function step(
  runtime: LuaProgramRuntime,
  inputs: number[] = Array.from({ length: 6 }, () => 0),
) {
  return voltages(runtime.step?.(0.001, inputs))
}

function frameText(commands: DrawCommand[]) {
  return commands
    .filter((command) => command.kind === 'text')
    .map((command) => command.text)
}

function expectGeometryInsideDisplay(commands: DrawCommand[]) {
  for (const command of commands) {
    if (command.kind === 'line' || command.kind === 'box') {
      expect(Math.min(command.x1, command.x2)).toBeGreaterThanOrEqual(0)
      expect(Math.max(command.x1, command.x2)).toBeLessThan(DISTING_DISPLAY.width)
      expect(Math.min(command.y1, command.y2)).toBeGreaterThanOrEqual(0)
      expect(Math.max(command.y1, command.y2)).toBeLessThan(DISTING_DISPLAY.height)
    } else if (command.kind === 'circle') {
      expect(command.x - command.radius).toBeGreaterThanOrEqual(0)
      expect(command.x + command.radius).toBeLessThan(DISTING_DISPLAY.width)
      expect(command.y - command.radius).toBeGreaterThanOrEqual(0)
      expect(command.y + command.radius).toBeLessThan(DISTING_DISPLAY.height)
    }
  }
}

afterEach(() => {
  while (engines.length > 0) engines.pop()?.global.close()
})

describe('Buchla 266 Source of Uncertainty recreation', () => {
  it('declares the fluctuating, quantized, and stored voltage sections', async () => {
    const { program } = await createHarness()

    expect(program.inputCount).toBe(6)
    expect(program.outputCount).toBe(6)
    expect(program.inputNames).toEqual([
      'Quantized Pulse', 'Stored Pulse', 'Rate A CV', 'Rate B CV',
      'Quantization CV', 'Distribution CV',
    ])
    expect(program.outputNames).toEqual([
      'Fluctuating A', 'Fluctuating B', 'N+1', '2^N',
      'Stored Equal', 'Stored Weighted',
    ])
    expect(program.outputKinds).toEqual([
      'linear', 'linear', 'stepped', 'stepped', 'stepped', 'stepped',
    ])
    expect(program.parameters.map((parameter) => parameter.name)).toEqual([
      'Rate A', 'Rate B', 'Quantization N', 'Distribution',
    ])
    expect(program.parameters.map((parameter) => parameter.value)).toEqual(DEFAULT_PARAMETERS)
  })

  it('moves the high-rate fluctuating voltage farther than the low-rate version', async () => {
    const slow = await createHarness([0.05, 0.05, 3, 0])
    const fast = await createHarness([50, 50, 3, 0])

    const slowOutput = step(slow.runtime)
    const fastOutput = step(fast.runtime)

    expect(Math.abs(fastOutput[1] - 5)).toBeGreaterThan(Math.abs(slowOutput[1] - 5))
    expect(Math.abs(fastOutput[2] - 5)).toBeGreaterThan(Math.abs(slowOutput[2] - 5))
    expect(fastOutput[1]).toBeGreaterThanOrEqual(0)
    expect(fastOutput[1]).toBeLessThanOrEqual(10)
  })

  it('uses same-step quantization CV for whole-volt and semitone state counts', async () => {
    const { runtime } = await createHarness()

    runtime.trigger?.(1)
    const highN = step(runtime, [0, 0, 0, 0, 3, 0])
    expect(highN[3]).toBeGreaterThanOrEqual(0)
    expect(highN[3]).toBeLessThanOrEqual(6)
    expect(Number.isInteger(highN[3])).toBe(true)
    expect(highN[4]).toBeGreaterThanOrEqual(0)
    expect(highN[4]).toBeLessThanOrEqual(63 / 12)
    expect(highN[4] * 12).toBeCloseTo(Math.round(highN[4] * 12), 10)

    runtime.trigger?.(1)
    const lowN = step(runtime, [0, 0, 0, 0, -5, 0])
    expect([0, 1]).toContain(lowN[3])
    expect([0, 1 / 12]).toContain(lowN[4])
  })

  it('skews the weighted stored output low or high while keeping both outputs bounded', async () => {
    const low = await createHarness()
    const high = await createHarness()

    low.runtime.trigger?.(2)
    high.runtime.trigger?.(2)
    const lowOutput = step(low.runtime, [0, 0, 0, 0, 0, -5])
    const highOutput = step(high.runtime, [0, 0, 0, 0, 0, 5])

    expect(lowOutput[5]).toBe(highOutput[5])
    expect(lowOutput[6]).toBeLessThan(highOutput[6])
    for (const value of [lowOutput[5], lowOutput[6], highOutput[5], highOutput[6]]) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(10)
    }
  })

  it('round-trips its random sequence and current voltages through preset state', async () => {
    const first = await createHarness()
    first.runtime.trigger?.(1)
    first.runtime.trigger?.(2)
    step(first.runtime, [0, 0, 1, -1, 2, 3])
    const saved = first.runtime.serialise?.()

    const restored = await createHarness(DEFAULT_PARAMETERS, saved)
    expect(restored.runtime.serialise?.()).toEqual(saved)

    expect(step(restored.runtime)).toEqual(step(first.runtime))
  })

  it('draws all three sections and their live voltages inside the display', async () => {
    const { display, runtime } = await createHarness()
    for (let index = 0; index < 90; index += 1) step(runtime)
    runtime.trigger?.(1)
    runtime.trigger?.(2)
    step(runtime)
    display.reset()

    expect(runtime.draw?.()).toBe(true)
    const commands = [...display.commands]
    expect(frameText(commands)).toEqual(expect.arrayContaining([
      'SOURCE OF UNCERTAINTY', '266', 'FLUCTUATING', 'QUANTIZED', 'STORED',
    ]))
    expect(findFirstTextOverflow(commands)).toBeUndefined()
    expectGeometryInsideDisplay(commands)
  })
})
