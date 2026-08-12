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
  join(process.cwd(), 'lua-scripts/fredi-bach/WeaveForge.lua'),
  'utf8',
)

const DEFAULT_PARAMETERS = [
  16, 20, 13, 30, 35, 1,
  1, 120, 7,
  1, 3, 0,
  5, 2, 0, 0, 0,
  3, 50, 0, 0,
  8, 100, 9, 100,
]

const DEFAULT_STATE = {
  registerA: 0xace1,
  registerB: 0x1d87,
  randomState: 12345,
  noteA: 0,
  noteB: 0,
  targetA: 0,
  targetB: 0,
  gateA: false,
  gateB: false,
}

type WeaveState = typeof DEFAULT_STATE

const engines: Awaited<ReturnType<typeof createDistingLuaTestEngine>>[] = []

function withParameters(changes: Record<number, number>) {
  const parameters = [...DEFAULT_PARAMETERS]
  Object.entries(changes).forEach(([oneBasedIndex, value]) => {
    parameters[Number(oneBasedIndex) - 1] = value
  })
  return parameters
}

async function createHarness(
  parameters = DEFAULT_PARAMETERS,
  restoredState: unknown = DEFAULT_STATE,
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

function voltages(value: unknown) {
  return Object.fromEntries(callbackOutputEntries(value) ?? []) as Record<number, number>
}

function step(
  runtime: LuaProgramRuntime,
  inputs: number[] = [0, 0, 0],
) {
  return voltages(runtime.step?.(0.001, inputs))
}

function advance(
  runtime: LuaProgramRuntime,
  milliseconds: number,
  inputs: number[] = [0, 0, 0],
) {
  let result: Record<number, number> = {}
  for (let index = 0; index < milliseconds; index += 1) {
    result = step(runtime, inputs)
  }
  return result
}

function clock(
  runtime: LuaProgramRuntime,
  count = 1,
  inputs: number[] = [0, 0, 0],
) {
  let result: Record<number, number> = {}
  for (let index = 0; index < count; index += 1) {
    runtime.trigger?.(1)
    result = step(runtime, inputs)
  }
  return result
}

function state(runtime: LuaProgramRuntime) {
  return runtime.serialise?.() as WeaveState
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
    }
  }
}

afterEach(() => {
  while (engines.length > 0) engines.pop()?.global.close()
})

describe('WeaveForge recreation', () => {
  it('declares the dual-register DUO layout, clock/CV inputs, and loom controls', async () => {
    const { program } = await createHarness()

    expect(program.inputKinds).toEqual(['trigger', 'cv', 'cv'])
    expect(program.inputNames).toEqual(['Clock', 'CV 1', 'CV 2'])
    expect(program.outputKinds).toEqual(['linear', 'linear', 'stepped', 'stepped'])
    expect(program.outputNames).toEqual(['A1 Note', 'B1 Note', 'A2 Gate', 'B2 Gate'])
    expect(program.parameters.map((parameter) => parameter.name)).toEqual([
      'Length A', 'Chance A', 'Length B', 'Chance B', 'Weave', 'Direction',
      'Clock', 'BPM', 'Rate', 'Root', 'Scale', 'Transpose',
      'Note Depth', 'Note Range', 'Note Slew', 'Note Rotate A', 'Note Rotate B',
      'Gate Depth', 'Gate Density', 'Gate Rotate A', 'Gate Rotate B',
      'CV1 Dest', 'CV1 Depth', 'CV2 Dest', 'CV2 Depth',
    ])
    expect(program.parameters.map((parameter) => parameter.value)).toEqual(DEFAULT_PARAMETERS)
  })

  it('locks each independent register to its exact feedback length at zero chance', async () => {
    const { runtime } = await createHarness(
      withParameters({ 1: 5, 2: 0, 3: 3, 4: 0, 5: 0 }),
      { ...DEFAULT_STATE, registerA: 1, registerB: 1 },
    )

    clock(runtime, 32)
    const settled = state(runtime)
    clock(runtime, 5)
    expect(state(runtime).registerA).toBe(settled.registerA)
    clock(runtime, 10)
    expect(state(runtime).registerB).toBe(settled.registerB)
  })

  it('makes full chance a deterministic phrase twice the selected length', async () => {
    const { runtime } = await createHarness(
      withParameters({ 1: 5, 2: 100, 3: 5, 4: 100, 5: 0 }),
      { ...DEFAULT_STATE, registerA: 1, registerB: 1 },
    )

    clock(runtime, 48)
    const settled = state(runtime)
    clock(runtime, 5)
    expect(state(runtime).registerA).not.toBe(settled.registerA)
    clock(runtime, 5)
    expect(state(runtime).registerA).toBe(settled.registerA)
    expect(state(runtime).registerB).toBe(settled.registerB)
  })

  it('chains unequal register lengths into one exact ring at full weave', async () => {
    const { runtime } = await createHarness(
      withParameters({ 1: 5, 2: 0, 3: 3, 4: 0, 5: 100, 6: 1 }),
      { ...DEFAULT_STATE, registerA: 1, registerB: 0 },
    )

    clock(runtime, 64)
    const settled = state(runtime)
    clock(runtime, 8)
    expect(state(runtime).registerA).toBe(settled.registerA)
    expect(state(runtime).registerB).toBe(settled.registerB)
  })

  it('exchanges both sampled tails before either register shifts', async () => {
    const { runtime } = await createHarness(
      withParameters({ 1: 2, 2: 0, 3: 2, 4: 0, 5: 100, 6: 1 }),
      { ...DEFAULT_STATE, registerA: 0b10, registerB: 0 },
    )

    clock(runtime)
    expect(state(runtime).registerA).toBe(0b100)
    expect(state(runtime).registerB).toBe(0b1)
  })

  it('keeps the sender bit-identical under one-way A-to-B coupling', async () => {
    const restored = {
      ...DEFAULT_STATE,
      registerA: 0x004b,
      registerB: 0x0037,
      randomState: 98765,
    }
    const coupled = await createHarness(
      withParameters({ 1: 7, 2: 0, 3: 5, 4: 40, 5: 100, 6: 2 }),
      restored,
    )
    const independent = await createHarness(
      withParameters({ 1: 7, 2: 0, 3: 5, 4: 40, 5: 0, 6: 1 }),
      restored,
    )

    let receiverDiverged = false
    for (let index = 0; index < 64; index += 1) {
      clock(coupled.runtime)
      clock(independent.runtime)
      expect(state(coupled.runtime).registerA).toBe(state(independent.runtime).registerA)
      receiverDiverged ||= state(coupled.runtime).registerB
        !== state(independent.runtime).registerB
    }
    expect(receiverDiverged).toBe(true)
  })

  it('uses density endpoints for silent and solid gates', async () => {
    const silent = await createHarness(withParameters({ 19: 0 }))
    const solid = await createHarness(withParameters({ 19: 100 }))

    expect(clock(silent.runtime)).toMatchObject({ 3: 0, 4: 0 })
    expect(clock(solid.runtime)).toMatchObject({ 3: 5, 4: 5 })
  })

  it('applies a same-control-step lock CV before a full-chance clock', async () => {
    const { runtime } = await createHarness(
      withParameters({
        1: 5,
        2: 100,
        3: 5,
        4: 100,
        5: 0,
        22: 12,
        23: 100,
      }),
      { ...DEFAULT_STATE, registerA: 1, registerB: 1 },
    )

    clock(runtime, 32, [0, 5, 0])
    const settled = state(runtime)
    clock(runtime, 5, [0, 5, 0])
    expect(state(runtime).registerA).toBe(settled.registerA)
    expect(state(runtime).registerB).toBe(settled.registerB)
  })

  it('edge-detects an assigned reset CV and restores both known patterns', async () => {
    const { runtime } = await createHarness(
      withParameters({ 22: 11 }),
      { ...DEFAULT_STATE, registerA: 0x1234, registerB: 0x5678 },
    )

    step(runtime, [0, 5, 0])
    expect(state(runtime)).toMatchObject({ registerA: 0xace1, registerB: 0x1d87 })

    clock(runtime, 1, [0, 5, 0])
    expect(state(runtime)).not.toMatchObject({ registerA: 0xace1, registerB: 0x1d87 })
  })

  it('schedules multiplied external steps from the measured clock interval', async () => {
    const { runtime } = await createHarness(withParameters({ 2: 0, 4: 0, 5: 0, 9: 8 }))

    clock(runtime)
    advance(runtime, 499)
    clock(runtime)
    const secondEdge = state(runtime)
    advance(runtime, 249)
    expect(state(runtime).registerA).toBe(secondEdge.registerA)
    expect(state(runtime).registerB).toBe(secondEdge.registerB)
    advance(runtime, 1)
    expect(state(runtime).registerA).not.toBe(secondEdge.registerA)
  })

  it('runs the selected rate from the explicit internal clock mode', async () => {
    const { runtime } = await createHarness(withParameters({
      2: 0,
      4: 0,
      5: 0,
      7: 2,
      8: 120,
      9: 7,
    }))
    const initial = state(runtime)

    advance(runtime, 499)
    expect(state(runtime).registerA).toBe(initial.registerA)
    advance(runtime, 2)
    expect(state(runtime).registerA).not.toBe(initial.registerA)
  })

  it('keeps quantized note outputs inside the selected minor scale and five-volt span', async () => {
    const { runtime } = await createHarness(withParameters({ 2: 50, 4: 50, 5: 40 }))
    const minorPitchClasses = new Set([0, 2, 3, 5, 7, 8, 10])

    for (let index = 0; index < 32; index += 1) {
      const output = clock(runtime)
      for (const channel of [1, 2]) {
        expect(output[channel]).toBeGreaterThanOrEqual(0)
        expect(output[channel]).toBeLessThanOrEqual(5)
        const semitone = Math.round(output[channel] * 12)
        expect(output[channel] * 12).toBeCloseTo(semitone, 10)
        expect(minorPitchClasses.has(semitone % 12)).toBe(true)
      }
    }
  })

  it('round-trips patterns, output state, and the random stream through preset state', async () => {
    const first = await createHarness()
    clock(first.runtime, 9, [0, 1.25, -0.5])
    const saved = state(first.runtime)

    const restored = await createHarness(DEFAULT_PARAMETERS, saved)
    expect(state(restored.runtime)).toEqual(saved)

    expect(clock(restored.runtime)).toEqual(clock(first.runtime))
    expect(state(restored.runtime)).toEqual(state(first.runtime))
  })

  it('draws the two opposed register rows, weave status, and output taps in bounds', async () => {
    const { display, runtime } = await createHarness()
    clock(runtime, 1, [0, 1, 0])
    display.reset()

    expect(runtime.draw?.()).toBe(true)
    const commands = [...display.commands]
    expect(frameText(commands)).toEqual(expect.arrayContaining([
      'WEAVEFORGE', 'EXT x1', 'BOTH W055', 'A', 'B', 'A1', 'A2', 'B1', 'B2',
      'A L16 C020  B L13 C030',
    ]))
    expect(findFirstTextOverflow(commands)).toBeUndefined()
    expectGeometryInsideDisplay(commands)
  })
})
