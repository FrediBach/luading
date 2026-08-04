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
  join(process.cwd(), 'lua-scripts/fredi-bach/Wind Meadow Physics.lua'),
  'utf8',
)

const DEFAULT_PARAMETERS = [
  45, 55, 30, 60, 100, 85, 1,
  0, 0, 0, 0, 0,
]

const engines: Awaited<ReturnType<typeof createDistingLuaTestEngine>>[] = []

function outputVoltages(value: unknown) {
  return Object.fromEntries(callbackOutputEntries(value) ?? []) as Record<number, number>
}

function step(runtime: LuaProgramRuntime, inputs = [0, 0, 0, 0, 0]) {
  return outputVoltages(runtime.step?.(0.001, inputs))
}

function advance(runtime: LuaProgramRuntime, milliseconds: number) {
  let outputs: Record<number, number> = {}
  for (let index = 0; index < milliseconds; index += 1) outputs = step(runtime)
  return outputs
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

function frameText(commands: DrawCommand[]) {
  return commands
    .filter((command) => command.kind === 'text')
    .map((command) => command.text)
}

afterEach(() => {
  while (engines.length > 0) engines.pop()?.global.close()
})

describe('Wind Meadow Physics', () => {
  it('declares five modulation inputs and seven meadow outputs', async () => {
    const { program } = await createHarness()

    expect(program.inputCount).toBe(5)
    expect(program.outputCount).toBe(7)
    expect(program.inputNames).toEqual([
      'Wind CV', 'Gusts CV', 'Turbulence CV', 'Flexibility CV', 'Travel CV',
    ])
    expect(program.outputNames).toEqual([
      'Grass 1', 'Grass 2', 'Grass 3', 'Grass 4',
      'Mean bend', 'Wind field', 'Gust gate',
    ])
    expect(program.parameters.map((parameter) => parameter.name)).toEqual([
      'Wind', 'Gusts', 'Turbulence', 'Flexibility', 'Travel', 'Damping',
      'Direction', 'Wind CV', 'Gusts CV', 'Turbulence CV',
      'Flexibility CV', 'Travel CV',
    ])
  })

  it('rests exactly when every wind source is zero', async () => {
    const { runtime } = await createHarness([
      0, 0, 0, 60, 100, 85, 1,
      0, 0, 0, 0, 0,
    ])

    expect(advance(runtime, 100)).toEqual({
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0,
    })
  })

  it('mirrors steady bend and wind voltage when direction reverses', async () => {
    const right = await createHarness([
      55, 0, 0, 65, 100, 100, 1,
      0, 0, 0, 0, 0,
    ])
    const left = await createHarness([
      55, 0, 0, 65, 100, 100, 2,
      0, 0, 0, 0, 0,
    ])

    const rightOutputs = advance(right.runtime, 800)
    const leftOutputs = advance(left.runtime, 800)
    for (let output = 1; output <= 6; output += 1) {
      expect(leftOutputs[output]).toBeCloseTo(-rightOutputs[output], 10)
    }
    expect(rightOutputs[7]).toBe(leftOutputs[7])
  })

  it('lets flexible grass settle to a deeper bend than stiff grass', async () => {
    const stiff = await createHarness([
      58, 0, 0, 10, 100, 110, 1,
      0, 0, 0, 0, 0,
    ])
    const flexible = await createHarness([
      58, 0, 0, 90, 100, 110, 1,
      0, 0, 0, 0, 0,
    ])

    const stiffOutputs = advance(stiff.runtime, 1500)
    const flexibleOutputs = advance(flexible.runtime, 1500)
    expect(flexibleOutputs[5]).toBeGreaterThan(stiffOutputs[5] + 0.5)
  })

  it('maps full-depth Wind CV to the matching knob value', async () => {
    const cvDriven = await createHarness([
      0, 55, 30, 60, 100, 85, 1,
      100, 0, 0, 0, 0,
    ])
    const knobDriven = await createHarness([
      100, 55, 30, 60, 100, 85, 1,
      0, 0, 0, 0, 0,
    ])

    const cvOutputs = step(cvDriven.runtime, [5, 0, 0, 0, 0])
    const knobOutputs = step(knobDriven.runtime)
    for (let output = 1; output <= 7; output += 1) {
      expect(cvOutputs[output]).toBeCloseTo(knobOutputs[output], 12)
    }
  })

  it('restores oscillator motion through the preset-state boundary', async () => {
    const original = await createHarness()
    advance(original.runtime, 300)
    const restored = await createHarness(DEFAULT_PARAMETERS, original.runtime.serialise?.())

    const originalNext = step(original.runtime)
    const restoredNext = step(restored.runtime)
    for (let output = 1; output <= 7; output += 1) {
      expect(restoredNext[output]).toBeCloseTo(originalNext[output], 12)
    }
  })

  it('draws animated grass, airflow, and status inside the display', async () => {
    const { display, runtime } = await createHarness()
    advance(runtime, 500)
    display.reset()
    expect(runtime.draw?.()).toBe(true)
    const commands = [...display.commands]

    expect(frameText(commands)).toEqual(expect.arrayContaining([
      'MEADOW PHYSICS', 'WIND >',
    ]))
    expect(frameText(commands).some((text) => /^MEAN [+-]\d+\.\dV$/.test(text))).toBe(true)
    expect(frameText(commands).some((text) => /^GUST (HIGH|LOW)$/.test(text))).toBe(true)
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
})
