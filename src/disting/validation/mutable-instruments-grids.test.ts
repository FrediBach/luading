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
import { loadLuaProgramRuntime, registerLuaModules } from '../emulation/lua-runtime'
import { createDistingLuaTestEngine } from '../testing/lua-test-environment'
import type { DrawCommand } from '../types'

const source = readFileSync(
  join(process.cwd(), 'lua-scripts/fredi-bach/Mutable Instruments Grids.lua'),
  'utf8',
)
const dataModule = readFileSync(
  join(process.cwd(), 'lua-scripts/fredi-bach/lib/MutableGridsData.lua'),
  'utf8',
)

const DEFAULT_PARAMETERS = [
  1, 120, 3, 1, 1, 1, 1, 50, 50, 0, 50, 50, 50,
]
const engines: Awaited<ReturnType<typeof createDistingLuaTestEngine>>[] = []
const zeroInputs = [0, 0, 0, 0, 0, 0]

function voltages(value: unknown) {
  return Object.fromEntries(callbackOutputEntries(value) ?? []) as Record<number, number>
}

function advance(runtime: LuaProgramRuntime, milliseconds = 1) {
  let result: unknown
  for (let index = 0; index < milliseconds; index += 1) {
    result = runtime.step?.(0.001, zeroInputs)
  }
  return voltages(result)
}

function externalTick(runtime: LuaProgramRuntime) {
  runtime.gate?.(1, true)
  return advance(runtime)
}

function externalParameters(overrides: Partial<{
  resolution: number
  mode: number
  signal: number
  layout: number
  swing: number
  x: number
  y: number
  chaos: number
  bd: number
  sd: number
  hh: number
}> = {}) {
  return [
    2,
    120,
    overrides.resolution ?? 2,
    overrides.mode ?? 1,
    overrides.signal ?? 1,
    overrides.layout ?? 1,
    overrides.swing ?? 1,
    overrides.x ?? 0,
    overrides.y ?? 0,
    overrides.chaos ?? 0,
    overrides.bd ?? 50,
    overrides.sd ?? 0,
    overrides.hh ?? 0,
  ]
}

async function createHarness(parameters = DEFAULT_PARAMETERS) {
  const lua = await createDistingLuaTestEngine(50)
  engines.push(lua)
  await registerLuaModules(lua, { MutableGridsData: dataModule })
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
  return { display, lua, program, runtime }
}

function frameText(commands: DrawCommand[]) {
  return commands
    .filter((command) => command.kind === 'text')
    .map((command) => command.text)
}

afterEach(() => {
  while (engines.length > 0) engines.pop()?.global.close()
})

describe('Mutable Instruments Grids recreation', () => {
  it('declares the original clock/reset/CV roles and six dual-layout outputs', async () => {
    const { program } = await createHarness()

    expect(program.inputCount).toBe(6)
    expect(program.inputKinds).toEqual(['gate', 'trigger', 'cv', 'cv', 'cv', 'cv'])
    expect(program.inputNames).toEqual([
      'Clock', 'Reset', 'Map X', 'Map Y', 'Chaos', 'Fill',
    ])
    expect(program.outputCount).toBe(6)
    expect(program.outputNames).toEqual([
      'BD', 'SD', 'HH', 'ACC 1 / ACC', 'ACC 2 / CLK', 'ACC 3 / RST',
    ])
    expect(program.parameters.map((parameter) => parameter.name)).toEqual([
      'Clock',
      'BPM',
      'Resolution',
      'Mode',
      'Signal',
      'Aux layout',
      'Swing',
      'Map X / Len 1',
      'Map Y / Len 2',
      'Chaos / Len 3',
      'BD Fill',
      'SD Fill',
      'HH Fill',
    ])
  })

  it('uses the upstream node data, interpolation rounding, density, and accent thresholds', async () => {
    const { runtime } = await createHarness(externalParameters({ bd: 57 }))
    const ticks: Record<number, number>[] = []

    for (let tick = 0; tick < 13; tick += 1) {
      ticks.push(externalTick(runtime))
      advance(runtime)
    }

    expect(ticks[0]).toMatchObject({ 1: 5, 4: 0 })
    expect(ticks[6]).toMatchObject({ 1: 0, 4: 0 })
    expect(ticks[12]).toMatchObject({ 1: 5, 4: 5 })
  })

  it('quantizes 24 PPQN clocks while mirroring every pulse in the alternate layout', async () => {
    const { runtime } = await createHarness(externalParameters({
      resolution: 3,
      layout: 2,
      bd: 100,
    }))

    expect(externalTick(runtime)).toMatchObject({ 1: 5, 5: 5, 6: 5 })
    advance(runtime)
    expect(externalTick(runtime)).toMatchObject({ 1: 0, 5: 5, 6: 0 })
    advance(runtime)
    expect(externalTick(runtime)).toMatchObject({ 1: 0, 5: 5, 6: 0 })
  })

  it('holds gate outputs until the external clock falling edge', async () => {
    const { runtime } = await createHarness(externalParameters({
      signal: 2,
      bd: 100,
    }))

    expect(externalTick(runtime)[1]).toBe(5)
    expect(advance(runtime, 20)[1]).toBe(5)
    expect(voltages(runtime.gate?.(1, false))[1]).toBe(0)
  })

  it('reads the original Euclidean lookup table at sixteenth-note cadence', async () => {
    const { runtime } = await createHarness(externalParameters({
      mode: 2,
      x: 22,
      bd: 50,
    }))
    const pattern: boolean[] = []

    for (let tick = 0; tick < 16; tick += 1) {
      const outputs = externalTick(runtime)
      if (tick % 2 === 0) pattern.push(outputs[1] === 5)
      advance(runtime)
    }

    expect(pattern).toEqual([true, false, true, false, true, false, true, false])
  })

  it('resets transparently and restarts from the first mapped step', async () => {
    const { runtime } = await createHarness(externalParameters({ bd: 57 }))

    expect(externalTick(runtime)[1]).toBe(5)
    advance(runtime)
    expect(externalTick(runtime)[1]).toBe(0)
    runtime.trigger?.(2)
    expect(externalTick(runtime)[1]).toBe(5)
  })

  it('runs the internal 24 PPQN clock at the selected BPM', async () => {
    const parameters = [...DEFAULT_PARAMETERS]
    parameters[5] = 2
    const { runtime } = await createHarness(parameters)

    expect(advance(runtime)[5]).toBe(5)
    expect(advance(runtime, 19)[5]).toBe(0)
    expect(advance(runtime)[5]).toBe(5)
  })

  it('renders map position, mode, clock, and three pattern lanes in bounds', async () => {
    const { display, runtime } = await createHarness()
    advance(runtime)
    display.reset()

    expect(runtime.draw?.()).toBe(true)
    const commands = [...display.commands]
    expect(frameText(commands)).toEqual(expect.arrayContaining([
      'GRIDS', 'MAP  120 BPM', 'BD', 'SD', 'HH',
    ]))
    expect(findFirstTextOverflow(commands)).toBeUndefined()
    expect(commands.every((command) => {
      if (command.kind === 'text') return true
      if (command.kind === 'circle') {
        return command.x - command.radius >= 0
          && command.y - command.radius >= 0
          && command.x + command.radius <= 255
          && command.y + command.radius <= 63
      }
      return command.x1 >= 0 && command.y1 >= 0
        && command.x2 <= 255 && command.y2 <= 63
    })).toBe(true)
  })
})
