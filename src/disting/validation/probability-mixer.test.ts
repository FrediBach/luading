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
  join(process.cwd(), 'lua-scripts/fredi-bach/Probability Mixer.lua'),
  'utf8',
)

const DEFAULT_PARAMETERS = [50, 100, 0, 0, 0, 0, 0, 0, 0]

const engines: Awaited<ReturnType<typeof createDistingLuaTestEngine>>[] = []

function voltages(value: unknown) {
  return Object.fromEntries(callbackOutputEntries(value) ?? []) as Record<number, number>
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

function routeGate(runtime: LuaProgramRuntime) {
  const rising = voltages(runtime.gate?.(1, true))
  const selected = rising[1] === 5 ? 1 : 2
  expect(rising[selected]).toBe(5)
  expect(voltages(runtime.gate?.(1, false))).toEqual({ [selected]: 0 })
  return selected
}

function frameText(commands: DrawCommand[]) {
  return commands
    .filter((command) => command.kind === 'text')
    .map((command) => command.text)
}

afterEach(() => {
  while (engines.length > 0) engines.pop()?.global.close()
})

describe('Probability Mixer', () => {
  it('declares the complementary gate router and all eight engine weights', async () => {
    const { program } = await createHarness()

    expect(program.inputNames).toEqual(['Gate', 'Reset'])
    expect(program.inputKinds).toEqual(['gate', 'trigger'])
    expect(program.outputNames).toEqual(['Pass', 'Reject'])
    expect(program.outputKinds).toEqual(['stepped', 'stepped'])
    expect(program.parameters.map((parameter) => parameter.name)).toEqual([
      'Base',
      'Independent',
      'Markov',
      'Bag',
      'Hazard',
      'Weighted cycle',
      'Random walk',
      'Alternating',
      'Streaky',
    ])
    expect(program.parameters.map((parameter) => parameter.value)).toEqual(DEFAULT_PARAMETERS)
  })

  it('subtracts normalized weighted failure from certainty', async () => {
    const { runtime } = await createHarness([50, 100, 15, 0, 0, 0, 0, 0, 0], {
      rngState: 12345,
    })

    routeGate(runtime)
    const state = runtime.serialise?.() as { lastProbability: number }

    // Initial inactive Markov probability is 50 * 0.35 = 17.5.
    expect(state.lastProbability).toBeCloseTo((100 * 50 + 15 * 17.5) / 115, 10)
  })

  it('falls back to Base when every engine weight is zero', async () => {
    const { runtime } = await createHarness([37, 0, 0, 0, 0, 0, 0, 0, 0], {
      rngState: 23456,
    })

    routeGate(runtime)
    const state = runtime.serialise?.() as { lastProbability: number }
    expect(state.lastProbability).toBe(37)
  })

  it('places exactly the Base share of gates in each bag window', async () => {
    const { runtime } = await createHarness([50, 0, 0, 100, 0, 0, 0, 0, 0], {
      rngState: 34567,
    })

    const routes = Array.from({ length: 16 }, () => routeGate(runtime))
    expect(routes.filter((route) => route === 1)).toHaveLength(8)
    expect(routes.filter((route) => route === 2)).toHaveLength(8)
  })

  it('resets both outputs and all probability process counters', async () => {
    const { runtime } = await createHarness()
    routeGate(runtime)
    routeGate(runtime)

    expect(voltages(runtime.trigger?.(2))).toEqual({ 1: 0, 2: 0 })
    expect(runtime.serialise?.()).toEqual(expect.objectContaining({
      stepIndex: 0,
      failureRun: 0,
      passCount: 0,
      rejectCount: 0,
      lastProbability: 50,
    }))
  })

  it('continues the same mixed process after preset-state restoration', async () => {
    const parameters = [55, 80, 20, 30, 20, 25, 20, 15, 10]
    const first = await createHarness(parameters, { rngState: 45678 })
    for (let index = 0; index < 12; index += 1) routeGate(first.runtime)
    const saved = first.runtime.serialise?.()

    const restored = await createHarness(parameters, saved)
    expect(restored.runtime.serialise?.()).toEqual(saved)
    expect(routeGate(restored.runtime)).toBe(routeGate(first.runtime))
    expect(restored.runtime.serialise?.()).toEqual(first.runtime.serialise?.())
  })

  it('draws the live mix and all eight engine lanes within the display', async () => {
    const { display, runtime } = await createHarness(
      [50, 100, 20, 20, 15, 20, 15, 15, 15],
      { rngState: 56789 },
    )
    routeGate(runtime)
    display.reset()

    expect(runtime.draw?.()).toBe(true)
    const commands = [...display.commands]
    expect(frameText(commands)).toEqual(expect.arrayContaining([
      'PROBABILITY MIXER', 'IND', 'MRK', 'BAG', 'HAZ',
      'CYC', 'WLK', 'ALT', 'STR',
    ]))
    expect(findFirstTextOverflow(commands)).toBeUndefined()
    for (const command of commands) {
      if (command.kind === 'line' || command.kind === 'box') {
        expect(Math.min(command.x1, command.x2)).toBeGreaterThanOrEqual(0)
        expect(Math.max(command.x1, command.x2)).toBeLessThan(DISTING_DISPLAY.width)
        expect(Math.min(command.y1, command.y2)).toBeGreaterThanOrEqual(0)
        expect(Math.max(command.y1, command.y2)).toBeLessThan(DISTING_DISPLAY.height)
      }
    }
  })
})
