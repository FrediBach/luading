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
  join(process.cwd(), 'lua-scripts/fredi-bach/ADDAC 508 Swell Physics.lua'),
  'utf8',
)

const DEFAULT_PARAMETERS = [
  70, 35, 35, 100, 0, 100,
  1, 2, 1,
  0, 0, 0, 0, 1, 0,
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

describe('ADDAC 508 Swell Physics recreation', () => {
  it('declares the five modulation inputs and complete seven-output surface', async () => {
    const { program } = await createHarness()

    expect(program.inputCount).toBe(5)
    expect(program.outputCount).toBe(7)
    expect(program.inputNames).toEqual([
      'Swell CV', 'Agitation CV', 'Spread CV', 'Speed CV', 'Aux CV',
    ])
    expect(program.outputNames).toEqual([
      'Buoy 1', 'Buoy 2', 'Buoy 3', 'Buoy 4', 'Average', 'Gate 1<2', 'Gate 3>4',
    ])
    expect(program.parameters.map((parameter) => parameter.name)).toEqual([
      'Swell', 'Agitation', 'Spread', 'Speed', 'Offset', 'Gain', 'Range',
      'Mode', 'Clipping', 'Swell CV', 'Agitation CV', 'Spread CV',
      'Speed CV', 'Aux target', 'Aux CV',
    ])
  })

  it('rests at 0 V bipolar or +5 V positive and routes Aux CV to offset', async () => {
    const stillBipolar = await createHarness([
      0, 35, 35, 100, 0, 100, 1, 2, 1, 0, 0, 0, 0, 1, 0,
    ])
    const stillPositive = await createHarness([
      0, 35, 35, 100, 0, 100, 2, 2, 1, 0, 0, 0, 0, 1, 0,
    ])
    const offsetCv = await createHarness([
      0, 35, 35, 100, 0, 100, 1, 2, 1, 0, 0, 0, 0, 1, 100,
    ])

    expect(step(stillBipolar.runtime)).toMatchObject({
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0,
    })
    expect(step(stillPositive.runtime)).toMatchObject({
      1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 0, 7: 0,
    })
    expect(step(offsetCv.runtime, [0, 0, 0, 0, 2])).toMatchObject({
      1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 0, 7: 0,
    })
  })

  it('makes Spread an exact path delay in Scrolling mode', async () => {
    const { runtime } = await createHarness([
      80, 70, 10, 100, 0, 100, 1, 1, 1, 0, 0, 0, 0, 1, 0,
    ])

    const earlierBuoyOne = advance(runtime, 500)[1]
    const laterBuoyTwo = advance(runtime, 20)[2]

    // Spread 10% maps to 2 * 0.1^2 = 20 ms between adjacent buoys.
    expect(laterBuoyTwo).toBeCloseTo(earlierBuoyOne, 10)
  })

  it('coincides at zero Spread and decorrelates spatially in Evolving mode', async () => {
    const coincident = await createHarness([
      100, 80, 0, 100, 0, 100, 1, 2, 1, 0, 0, 0, 0, 1, 0,
    ])
    const separated = await createHarness([
      100, 80, 100, 100, 0, 100, 1, 2, 1, 0, 0, 0, 0, 1, 0,
    ])

    const coincidentOutputs = advance(coincident.runtime, 700)
    expect(coincidentOutputs[2]).toBeCloseTo(coincidentOutputs[1], 12)
    expect(coincidentOutputs[3]).toBeCloseTo(coincidentOutputs[1], 12)
    expect(coincidentOutputs[4]).toBeCloseTo(coincidentOutputs[1], 12)

    const separatedOutputs = advance(separated.runtime, 700)
    const buoyValues = [1, 2, 3, 4].map((index) => separatedOutputs[index])
    expect(Math.max(...buoyValues) - Math.min(...buoyValues)).toBeGreaterThan(0.5)
    expect(separatedOutputs[5]).toBeCloseTo(
      buoyValues.reduce((sum, value) => sum + value, 0) / 4,
      12,
    )
    expect(separatedOutputs[6]).toBe(
      separatedOutputs[1] < separatedOutputs[2] ? 5 : 0,
    )
    expect(separatedOutputs[7]).toBe(
      separatedOutputs[3] > separatedOutputs[4] ? 5 : 0,
    )
  })

  it('keeps all three clipping modes bounded and gives them distinct overflow behavior', async () => {
    const fold = await createHarness([
      200, 0, 0, 100, 0, 100, 1, 2, 1, 0, 0, 0, 0, 1, 0,
    ])
    const thru = await createHarness([
      200, 0, 0, 100, 0, 100, 1, 2, 2, 0, 0, 0, 0, 1, 0,
    ])
    const limit = await createHarness([
      200, 0, 0, 100, 0, 100, 1, 2, 3, 0, 0, 0, 0, 1, 0,
    ])
    let sawFoldVsThru = false
    let sawFoldVsLimit = false

    for (let index = 0; index < 2500; index += 1) {
      const foldOutputs = step(fold.runtime)
      const thruOutputs = step(thru.runtime)
      const limitOutputs = step(limit.runtime)
      for (const outputs of [foldOutputs, thruOutputs, limitOutputs]) {
        for (let buoy = 1; buoy <= 4; buoy += 1) {
          expect(outputs[buoy]).toBeGreaterThanOrEqual(-5)
          expect(outputs[buoy]).toBeLessThanOrEqual(5)
        }
      }
      if (Math.abs(foldOutputs[1] - thruOutputs[1]) > 0.01) sawFoldVsThru = true
      if (Math.abs(foldOutputs[1] - limitOutputs[1]) > 0.01) sawFoldVsLimit = true
    }

    expect(sawFoldVsThru).toBe(true)
    expect(sawFoldVsLimit).toBe(true)
  })

  it('maps a full-depth Swell CV to the same surface as the matching knob value', async () => {
    const cvDriven = await createHarness([
      0, 35, 35, 100, 0, 100, 1, 2, 1, 100, 0, 0, 0, 1, 0,
    ])
    const knobDriven = await createHarness([
      100, 35, 35, 100, 0, 100, 1, 2, 1, 0, 0, 0, 0, 1, 0,
    ])

    const cvOutputs = step(cvDriven.runtime, [5, 0, 0, 0, 0])
    const knobOutputs = step(knobDriven.runtime)
    for (let output = 1; output <= 7; output += 1) {
      expect(cvOutputs[output]).toBeCloseTo(knobOutputs[output], 12)
    }
  })

  it('restores its wave time through the preset-state boundary', async () => {
    const original = await createHarness()
    advance(original.runtime, 731)
    const state = original.runtime.serialise?.()
    const restored = await createHarness(DEFAULT_PARAMETERS, state)

    const originalNext = step(original.runtime)
    const restoredNext = step(restored.runtime)
    for (let output = 1; output <= 7; output += 1) {
      expect(restoredNext[output]).toBeCloseTo(originalNext[output], 12)
    }
  })

  it('draws four buoys, range, clipping, average, and gates inside the display', async () => {
    const { display, runtime } = await createHarness()
    advance(runtime, 900)
    display.reset()
    expect(runtime.draw?.()).toBe(true)
    const commands = [...display.commands]

    expect(frameText(commands)).toEqual(expect.arrayContaining([
      'SWELL PHYSICS', 'EVOLVE', 'BIPOLAR', 'FOLD', '1', '2', '3', '4',
    ]))
    expect(frameText(commands).some((text) => /^AVG [+-]\d+\.\dV$/.test(text))).toBe(true)
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
