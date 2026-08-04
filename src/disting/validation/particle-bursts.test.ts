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
  join(process.cwd(), 'lua-scripts/fredi-bach/Particle Bursts.lua'),
  'utf8',
)

const DEFAULT_PARAMETERS = [
  8, 1, 2, 1, 0, 0, 0, 1, 10,
  13, 100, 100, 15, 1,
  13, 100, 100, 15, 1,
  13, 100, 100, 15, 1,
  13, 100, 100, 15, 1,
]

const engines: Awaited<ReturnType<typeof createDistingLuaTestEngine>>[] = []

function entries(value: unknown) {
  return Object.fromEntries(callbackOutputEntries(value) ?? []) as Record<number, number>
}

function zeroInputs() {
  return Array.from({ length: 11 }, () => 0)
}

class OutputState {
  readonly voltages = Array.from({ length: 5 }, () => 0)

  apply(value: unknown) {
    for (const [index, voltage] of callbackOutputEntries(value) ?? []) {
      if (typeof voltage === 'number') this.voltages[index - 1] = voltage
    }
    return [...this.voltages]
  }
}

function step(
  runtime: LuaProgramRuntime,
  outputState: OutputState,
  inputs = zeroInputs(),
) {
  return outputState.apply(runtime.step?.(0.001, inputs))
}

function advance(
  runtime: LuaProgramRuntime,
  outputState: OutputState,
  milliseconds: number,
  inputs = zeroInputs(),
) {
  let result = [...outputState.voltages]
  for (let index = 0; index < milliseconds; index += 1) {
    result = step(runtime, outputState, inputs)
  }
  return result
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
  return { display, outputState: new OutputState(), program, runtime }
}

function withParameter(index: number, value: number) {
  const parameters = [...DEFAULT_PARAMETERS]
  parameters[index - 1] = value
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

describe('Particle Bursts recreation', () => {
  it('declares four trigger lanes, clock/reset and modulation CVs, plus random CV', async () => {
    const { program } = await createHarness()

    expect(program.inputCount).toBe(11)
    expect(program.outputCount).toBe(5)
    expect(program.inputNames).toEqual([
      'Trigger 1', 'Trigger 2', 'Trigger 3', 'Trigger 4',
      'Clock', 'Reset', 'Rate CV', 'Shift CV',
      'Probability CV', 'Absorb CV', 'Gater CV',
    ])
    expect(program.outputNames).toEqual([
      'Burst 1', 'Burst 2', 'Burst 3', 'Burst 4', 'Random CV',
    ])
    expect(program.parameters).toHaveLength(29)
    expect(program.parameters.slice(0, 9).map((parameter) => parameter.name)).toEqual([
      'Repetitions', 'Distribution', 'Triplets', 'Shift mode', 'Shift',
      'Probability', 'Absorb', 'Gater', 'Pulse',
    ])
    expect(program.parameters.slice(9, 14).map((parameter) => parameter.name)).toEqual([
      'Ch1 Repeat limit', 'Ch1 Probability limit', 'Ch1 Absorb limit',
      'Ch1 Gater limit', 'Ch1 State',
    ])
  })

  it('distributes a capped two-pulse burst over the measured clock', async () => {
    const parameters = [...DEFAULT_PARAMETERS]
    parameters[0] = 8 // Global rate 16.
    parameters[2] = 1 // Allow triplet-derived menu values.
    parameters[8] = 5
    parameters[9] = 2 // Channel 1 caps the burst at two pulses.
    const { outputState, runtime } = await createHarness(parameters)

    runtime.trigger?.(5)
    step(runtime, outputState)
    advance(runtime, outputState, 9)
    runtime.trigger?.(5)
    step(runtime, outputState) // Measured clock period is 10 ms.

    runtime.trigger?.(1)
    expect(step(runtime, outputState)[0]).toBe(5)
    expect(advance(runtime, outputState, 79)[0]).toBe(0)
    expect(step(runtime, outputState)[0]).toBe(5)
  })

  it('lets Probability remove originals while Absorb preserves them and removes repeats', async () => {
    const probabilityParameters = [...DEFAULT_PARAMETERS]
    probabilityParameters[0] = 2
    probabilityParameters[2] = 1
    probabilityParameters[5] = 100
    const probability = await createHarness(probabilityParameters)

    probability.runtime.trigger?.(1)
    expect(step(probability.runtime, probability.outputState)[0]).toBe(0)

    const absorbParameters = [...DEFAULT_PARAMETERS]
    absorbParameters[0] = 2
    absorbParameters[2] = 1
    absorbParameters[6] = 100
    const absorb = await createHarness(absorbParameters)

    absorb.runtime.trigger?.(1)
    expect(step(absorb.runtime, absorb.outputState)[0]).toBe(5)
    expect(advance(absorb.runtime, absorb.outputState, 1000)[0]).toBe(0)
  })

  it('rotates processed lanes but keeps per-channel bypass direct', async () => {
    const shiftedParameters = withParameter(5, 1)
    const shifted = await createHarness(shiftedParameters)
    shifted.runtime.trigger?.(1)
    expect(step(shifted.runtime, shifted.outputState).slice(0, 4)).toEqual([0, 5, 0, 0])

    const bypassParameters = withParameter(14, 2)
    bypassParameters[4] = 3
    bypassParameters[5] = 100
    bypassParameters[6] = 100
    bypassParameters[7] = 15
    const bypass = await createHarness(bypassParameters)
    bypass.runtime.trigger?.(1)
    expect(step(bypass.runtime, bypass.outputState).slice(0, 4)).toEqual([5, 0, 0, 0])
  })

  it('advances forward shift on clocks and lets simultaneous reset restore lane one', async () => {
    const parameters = withParameter(4, 2)
    const { outputState, runtime } = await createHarness(parameters)

    runtime.trigger?.(5)
    runtime.trigger?.(1)
    expect(step(runtime, outputState).slice(0, 4)).toEqual([0, 5, 0, 0])

    advance(runtime, outputState, 10)
    runtime.trigger?.(6)
    runtime.trigger?.(5)
    runtime.trigger?.(1)
    expect(step(runtime, outputState).slice(0, 4)).toEqual([5, 0, 0, 0])
  })

  it('uses the clocked gater as alternating mute windows', async () => {
    const parameters = withParameter(8, 2) // 1/1 toggles every clock.
    const { outputState, runtime } = await createHarness(parameters)

    runtime.trigger?.(5)
    runtime.trigger?.(1)
    expect(step(runtime, outputState)[0]).toBe(0)

    runtime.trigger?.(5)
    runtime.trigger?.(1)
    expect(step(runtime, outputState)[0]).toBe(5)
  })

  it('updates a bounded random CV on clocks and restores its sequence state', async () => {
    const original = await createHarness()
    original.runtime.trigger?.(5)
    const first = step(original.runtime, original.outputState)[4]
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThan(10)

    const state = original.runtime.serialise?.()
    const restored = await createHarness(DEFAULT_PARAMETERS, state)
    original.runtime.trigger?.(5)
    restored.runtime.trigger?.(5)
    const originalNext = step(original.runtime, original.outputState)[4]
    const restoredNext = step(restored.runtime, restored.outputState)[4]
    expect(restoredNext).toBeCloseTo(originalNext, 12)
  })

  it('renders four in-bounds particle lanes and the active variation settings', async () => {
    const { display, outputState, runtime } = await createHarness()
    runtime.trigger?.(1)
    step(runtime, outputState)
    display.reset()

    expect(runtime.draw?.()).toBe(true)
    const commands = [...display.commands]
    expect(frameText(commands)).toEqual(expect.arrayContaining([
      'PARTICLE BURSTS', 'R 16 C16', 'SHIFT 0', 'P00 A00', 'G Off',
    ]))
    expect(commands.filter((command) => command.kind === 'circle').length).toBeGreaterThan(0)
    expect(findFirstTextOverflow(commands)).toBeUndefined()

    for (const command of commands) {
      if (command.kind === 'line') {
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
  })

  it('rounds fractional CV-derived percentages before integer display formatting', async () => {
    const { display, outputState, runtime } = await createHarness()
    const inputs = zeroInputs()
    inputs[8] = 0.123 // 2.46 probability percentage points.
    inputs[9] = 0.321 // 6.42 absorb percentage points.
    step(runtime, outputState, inputs)
    display.reset()

    expect(runtime.draw?.()).toBe(true)
    expect(frameText([...display.commands])).toContain('P02 A06')
  })

  it('returns sparse-compatible output tables at the real Lua boundary', async () => {
    const { runtime } = await createHarness()
    runtime.trigger?.(1)
    expect(entries(runtime.step?.(0.001, zeroInputs()))).toMatchObject({ 1: 5 })
  })
})
