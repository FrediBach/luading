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
  join(process.cwd(), 'lua-scripts/fredi-bach/Vermona Random Rhythm.lua'),
  'utf8',
)

const DEFAULT_PARAMETERS = [
  1, 120, 100, 65, 25, 35, 1, 1, 1, 1, 1, 0,
  1, 120, 100, 45, 55, 20, 1, 1, 1, 1, 1, 0,
]

const engines: Awaited<ReturnType<typeof createDistingLuaTestEngine>>[] = []

function section(
  clock: number,
  bpm: number,
  probabilities: [number, number, number, number],
  options: {
    mode?: number
    bar?: number
    divisionOutput?: number
    offbeat?: number
    reset?: number
    swing?: number
  } = {},
) {
  return [
    clock,
    bpm,
    ...probabilities,
    options.mode ?? 1,
    options.bar ?? 1,
    options.divisionOutput ?? 1,
    options.offbeat ?? 1,
    options.reset ?? 1,
    options.swing ?? 0,
  ]
}

function voltages(value: unknown) {
  return Object.fromEntries(callbackOutputEntries(value) ?? []) as Record<number, number>
}

function advance(runtime: LuaProgramRuntime, milliseconds: number) {
  let result: unknown
  for (let index = 0; index < milliseconds; index += 1) {
    result = runtime.step?.(0.001, [0, 0, 0, 0, 0])
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

function frameText(commands: DrawCommand[]) {
  return commands
    .filter((command) => command.kind === 'text')
    .map((command) => command.text)
}

function activeFirstSectionBeat(commands: DrawCommand[]) {
  const marker = commands.find((command) => (
    command.kind === 'box'
    && command.fill
    && command.y1 === 12
    && command.y2 === 14
    && command.shade === 13
    && command.x1 < 128
  ))
  return marker?.kind === 'box' ? (marker.x1 - 7) / 7 : null
}

afterEach(() => {
  while (engines.length > 0) engines.pop()?.global.close()
})

describe('Vermona Random Rhythm recreation', () => {
  it('declares two clocks, shared reset, dice triggers, and ten hardware-style outputs', async () => {
    const { program } = await createHarness()

    expect(program.inputCount).toBe(5)
    expect(program.outputCount).toBe(10)
    expect(program.inputNames).toEqual([
      'Clock 1', 'Clock 2', 'Reset', 'Dice 1', 'Dice 2',
    ])
    expect(program.outputNames).toEqual([
      'Ch1 Seq', 'Ch1 1/4', 'Ch1 1/8', 'Ch1 1/16', 'Ch1 1/3',
      'Ch2 Seq', 'Ch2 1/4', 'Ch2 1/8', 'Ch2 1/16', 'Ch2 1/3',
    ])
    expect(program.parameters).toHaveLength(24)
    expect(program.parameters.map((parameter) => parameter.name)).toEqual([
      'Ch1 Clock', 'Ch1 BPM', 'Ch1 1/4', 'Ch1 1/8', 'Ch1 1/16', 'Ch1 1/3',
      'Ch1 Mode', 'Ch1 Bar', 'Ch1 Div out', 'Ch1 Offbeat', 'Ch1 Reset', 'Ch1 Swing',
      'Ch2 Clock', 'Ch2 BPM', 'Ch2 1/4', 'Ch2 1/8', 'Ch2 1/16', 'Ch2 1/3',
      'Ch2 Mode', 'Ch2 Bar', 'Ch2 Div out', 'Ch2 Offbeat', 'Ch2 Reset', 'Ch2 Swing',
    ])
  })

  it('sums exclusive subdivision events into SEQ at the documented beat positions', async () => {
    const parameters = [
      ...section(1, 120, [100, 100, 100, 100]),
      ...section(1, 120, [0, 0, 0, 0]),
    ]
    const { runtime } = await createHarness(parameters)

    expect(advance(runtime, 1)).toMatchObject({ 1: 10, 2: 10, 3: 0, 4: 0, 5: 0 })
    expect(advance(runtime, 124)).toMatchObject({ 1: 10, 2: 0, 3: 0, 4: 10, 5: 0 })
    expect(advance(runtime, 42)).toMatchObject({ 1: 10, 2: 0, 3: 0, 4: 0, 5: 10 })
    expect(advance(runtime, 83)).toMatchObject({ 1: 10, 2: 0, 3: 10, 4: 0, 5: 0 })
  })

  it('turns the individual outputs into full-resolution clocks without changing SEQ', async () => {
    const parameters = [
      ...section(1, 120, [0, 0, 0, 0], {
        divisionOutput: 2,
        offbeat: 2,
      }),
      ...section(1, 120, [0, 0, 0, 0]),
    ]
    const { runtime } = await createHarness(parameters)

    expect(advance(runtime, 1)).toMatchObject({
      1: 0,
      2: 10,
      3: 10,
      4: 10,
      5: 10,
    })
    expect(advance(runtime, 124)).toMatchObject({
      1: 0,
      2: 0,
      3: 0,
      4: 10,
      5: 0,
    })
  })

  it('shifts the sixteenth events later with positive swing', async () => {
    const straight = await createHarness([
      ...section(1, 120, [0, 0, 100, 0]),
      ...section(1, 120, [0, 0, 0, 0]),
    ])
    const swung = await createHarness([
      ...section(1, 120, [0, 0, 100, 0], { swing: 50 }),
      ...section(1, 120, [0, 0, 0, 0]),
    ])

    expect(advance(straight.runtime, 125)[4]).toBe(10)
    expect(advance(swung.runtime, 125)[4]).toBe(0)
    expect(advance(swung.runtime, 32)[4]).toBe(10)
  })

  it('wraps a three-beat Dice pattern after the third quarter', async () => {
    const { display, runtime } = await createHarness([
      ...section(1, 120, [100, 0, 0, 0], { bar: 2 }),
      ...section(1, 120, [0, 0, 0, 0]),
    ])

    const displayedBeat = () => {
      display.reset()
      runtime.draw?.()
      return activeFirstSectionBeat([...display.commands])
    }

    advance(runtime, 1)
    expect(displayedBeat()).toBe(0)
    advance(runtime, 499)
    expect(displayedBeat()).toBe(1)
    advance(runtime, 500)
    expect(displayedBeat()).toBe(2)
    advance(runtime, 500)
    expect(displayedBeat()).toBe(0)
  })

  it('keeps external clocks independent between the two sections', async () => {
    const { runtime } = await createHarness([
      ...section(2, 120, [100, 0, 0, 0]),
      ...section(2, 120, [100, 0, 0, 0]),
    ])

    expect(voltages(runtime.trigger?.(1))).toMatchObject({
      1: 10, 2: 10, 6: 0, 7: 0,
    })
    advance(runtime, 11)
    expect(voltages(runtime.trigger?.(2))).toMatchObject({
      1: 0, 2: 0, 6: 10, 7: 10,
    })
  })

  it('mutes a section for the duration of a reset gate', async () => {
    const { runtime } = await createHarness([
      ...section(1, 120, [100, 100, 100, 100], { reset: 2 }),
      ...section(1, 120, [0, 0, 0, 0], { reset: 3 }),
    ])

    expect(advance(runtime, 1)[1]).toBe(10)
    expect(voltages(runtime.gate?.(3, true))).toMatchObject({
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0,
    })
    expect(advance(runtime, 500)).toMatchObject({
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0,
    })
    runtime.gate?.(3, false)
    expect(advance(runtime, 500)[1]).toBe(10)
  })

  it('holds +10 V pulses for exactly ten 1 ms control steps', async () => {
    const { runtime } = await createHarness([
      ...section(1, 120, [100, 0, 0, 0]),
      ...section(1, 120, [0, 0, 0, 0]),
    ])

    expect(advance(runtime, 1)[1]).toBe(10)
    expect(advance(runtime, 9)[1]).toBe(10)
    expect(advance(runtime, 1)[1]).toBe(0)
  })

  it('re-dices a section and restores its stored Dice pattern from preset state', async () => {
    const first = await createHarness()
    const original = first.runtime.serialise?.() as {
      sections: Array<{ dice: number[][] }>
    }

    first.runtime.trigger?.(4)
    const rediced = first.runtime.serialise?.() as typeof original
    expect(rediced.sections[0]?.dice).not.toEqual(original.sections[0]?.dice)
    expect(rediced.sections[1]?.dice).toEqual(original.sections[1]?.dice)

    const restored = await createHarness(DEFAULT_PARAMETERS, rediced)
    expect(restored.runtime.serialise?.()).toEqual(rediced)
  })

  it('renders both sections, probability lanes, modes, and beat positions in bounds', async () => {
    const { display, runtime } = await createHarness()
    advance(runtime, 1)
    display.reset()

    expect(runtime.draw?.()).toBe(true)
    const commands = [...display.commands]
    const text = frameText(commands)
    expect(text).toEqual(expect.arrayContaining([
      '1 DICE 4/4 120',
      '2 DICE 4/4 120',
      '1/4',
      '1/8',
      '1/16',
      '1/3',
      'SEQ',
    ]))
    expect(commands.filter((command) => (
      command.kind === 'box' && !command.fill
    ))).toHaveLength(8)
    expect(findFirstTextOverflow(commands)).toBeUndefined()
  })
})
