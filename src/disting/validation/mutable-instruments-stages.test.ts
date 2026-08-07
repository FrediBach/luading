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
import { parseParameterPresets } from '../emulation/parameter-presets'
import { createDistingLuaTestEngine } from '../testing/lua-test-environment'
import { DISTING_DISPLAY, type DrawCommand } from '../types'

const source = readFileSync(
  join(process.cwd(), 'lua-scripts/fredi-bach/Mutable Instruments Stages.lua'),
  'utf8',
)

const RAMP = 1
const STEP = 2
const HOLD = 3

const DEFAULT_PARAMETERS = [
  4, 4, 3,
  RAMP, 30, -25,
  RAMP, 45, 25,
  HOLD, 60, -40,
  RAMP, 55, 20,
  RAMP, 50, 0,
  RAMP, 50, 0,
  RAMP, 50, 0,
  RAMP, 50, 0,
]

const engines: Awaited<ReturnType<typeof createDistingLuaTestEngine>>[] = []

function voltages(value: unknown) {
  return Object.fromEntries(callbackOutputEntries(value) ?? []) as Record<number, number>
}

function advance(
  runtime: LuaProgramRuntime,
  milliseconds: number,
  inputs: number[] = Array.from({ length: 9 }, () => 0),
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

function expectFrameInsideDisplay(commands: DrawCommand[]) {
  expect(findFirstTextOverflow(commands)).toBeUndefined()

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

describe('Mutable Instruments Stages recreation', () => {
  it('declares one gate, eight segment CVs, and envelope/activity outputs', async () => {
    const { program } = await createHarness()

    expect(program.inputCount).toBe(9)
    expect(program.outputCount).toBe(9)
    expect(program.inputNames).toEqual([
      'Gate', 'S1 CV', 'S2 CV', 'S3 CV', 'S4 CV',
      'S5 CV', 'S6 CV', 'S7 CV', 'S8 CV',
    ])
    expect(program.outputNames).toEqual([
      'Envelope', 'S1 Activity', 'S2 Activity', 'S3 Activity',
      'S4 Activity', 'S5 Activity', 'S6 Activity', 'S7 Activity',
      'S8 Activity',
    ])
    expect(program.parameters).toHaveLength(27)
    expect(program.parameters.slice(0, 6).map(({ name }) => name)).toEqual([
      'Stages', 'Loop start', 'Loop end',
      'S1 Type', 'S1 Primary', 'S1 Secondary',
    ])
  })

  it('runs a two-ramp AD envelope and exposes segment activity ramps', async () => {
    const { runtime } = await createHarness(withParameters({
      1: 2, 2: 1, 3: 1,
      4: RAMP, 5: 0, 6: 0,
      7: RAMP, 8: 0, 9: 0,
    }))

    expect(voltages(runtime.gate?.(1, true))).toMatchObject({ 1: 0, 2: 8, 3: 0 })
    expect(advance(runtime, 1)).toMatchObject({ 1: 8, 2: 0, 3: 8 })
    expect(advance(runtime, 1)).toMatchObject({ 1: 0, 2: 0, 3: 0 })
  })

  it('holds an ADSR sustain loop until the gate falls, then releases', async () => {
    const { runtime } = await createHarness(withParameters({
      1: 4, 2: 4, 3: 3,
      4: RAMP, 5: 0, 6: 0,
      7: RAMP, 8: 0, 9: 0,
      10: HOLD, 11: 50, 12: -100,
      13: RAMP, 14: 0, 15: 0,
    }))

    runtime.gate?.(1, true)
    expect(advance(runtime, 2)).toMatchObject({ 1: 4, 4: 8 })
    expect(advance(runtime, 6)).toMatchObject({ 1: 4, 4: 8 })

    expect(voltages(runtime.gate?.(1, false))).toMatchObject({ 1: 4, 4: 0, 5: 8 })
    expect(advance(runtime, 1)).toMatchObject({ 1: 0, 5: 0 })
  })

  it('samples Step levels with CV and waits for the next gate rise', async () => {
    const { runtime } = await createHarness(withParameters({
      1: 2, 2: 1, 3: 1,
      4: STEP, 5: 25, 6: -100,
      7: STEP, 8: 75, 9: -100,
    }))

    advance(runtime, 1, [0, 1, 0, 0, 0, 0, 0, 0, 0])
    expect(voltages(runtime.gate?.(1, true))[1]).toBe(3)
    runtime.gate?.(1, false)
    expect(advance(runtime, 20)[1]).toBe(3)

    expect(voltages(runtime.gate?.(1, true))[1]).toBe(6)
    runtime.gate?.(1, false)
    expect(advance(runtime, 20)[1]).toBe(6)
  })

  it('keeps a loop ending on the final stage running after gate release', async () => {
    const { runtime } = await createHarness(withParameters({
      1: 2, 2: 2, 3: 2,
      4: RAMP, 5: 0, 6: 0,
      7: RAMP, 8: 0, 9: 0,
    }))

    runtime.gate?.(1, true)
    advance(runtime, 1)
    runtime.gate?.(1, false)
    expect(advance(runtime, 1)[1]).toBe(0)
    expect(advance(runtime, 1)[1]).toBe(8)
    expect(advance(runtime, 1)[1]).toBe(0)
  })

  it('round-trips an active envelope through Disting preset state', async () => {
    const first = await createHarness()
    first.runtime.gate?.(1, true)
    advance(first.runtime, 12)
    const saved = first.runtime.serialise?.()

    const restored = await createHarness(DEFAULT_PARAMETERS, saved)
    expect(restored.runtime.serialise?.()).toEqual(saved)
  })

  it('provides the usual envelope families and bounded eight-stage graphics', async () => {
    const { display, program, runtime } = await createHarness(withParameters({ 1: 8 }))
    const parsed = parseParameterPresets(runtime.program.luading, program.parameters)

    expect(parsed.diagnostics).toEqual([])
    expect(parsed.presets.map(({ name }) => name)).toEqual(expect.arrayContaining([
      'Decay', 'AD', 'AR', 'ASR', 'AHR', 'ADSR', 'Delayed ADSR',
      'Rest-level ADSR', 'AHDSR', 'AD1D2SR', 'AD1D2SR1R2',
      'Trapezoid LFO', '5 Step Sequence', 'Glide Sequence',
    ]))

    display.reset()
    expect(runtime.draw?.()).toBe(true)
    const commands = [...display.commands]
    expect(frameText(commands)).toEqual(expect.arrayContaining([
      'STAGES', 'GATE LOW', 'IDLE', '+0.00V',
      'R1', 'R2', 'H3', 'R4', 'R5', 'R6', 'R7', 'R8',
    ]))
    expectFrameInsideDisplay(commands)
  })
})
