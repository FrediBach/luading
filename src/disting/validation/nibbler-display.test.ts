/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
  join(process.cwd(), 'lua-scripts/fredi-bach/Nibbler.lua'),
  'utf8',
)

const COUNT_BY_ONE = [2, 1, 1, 1, 1, 1, 1, 1]

function outputVoltages(value: unknown) {
  return Object.fromEntries(callbackOutputEntries(value) ?? [])
}

function frameText(commands: DrawCommand[]) {
  return commands
    .filter((command) => command.kind === 'text')
    .map((command) => command.text)
}

describe('Nibbler recreation', () => {
  let display: DistingDisplayApi
  let lua: Awaited<ReturnType<typeof createDistingLuaTestEngine>>
  let runtime: LuaProgramRuntime

  beforeEach(async () => {
    lua = await createDistingLuaTestEngine(50)
    display = new DistingDisplayApi()
    display.register(lua.global)
    runtime = await loadLuaProgramRuntime(lua, source)
    runtime.configure(1, 0)
    runtime.setParameters(COUNT_BY_ONE)
  })

  afterEach(() => {
    lua.global.close()
  })

  it('declares the complete hardware-inspired control and output surface', () => {
    const rawInit = runtime.init?.()
    const init = rawInit && typeof rawInit === 'object' ? rawInit as LuaInitResult : {}
    const program = describeProgram(runtime.program, init)

    expect(program.inputCount).toBe(11)
    expect(program.outputCount).toBe(7)
    expect(program.inputNames).toEqual([
      'Clock', 'Reset', 'Sub', 'Gate 1', 'Gate 2', 'Gate 4', 'Gate 8',
      'Shift', 'Shift Data', 'Data XOR', 'Carry In',
    ])
    expect(program.outputNames).toEqual([
      'Stepped 1', 'Stepped 2', 'Carry', 'Out 8', 'Out 4', 'Out 2', 'Out 1',
    ])
    expect(program.parameters.map((parameter) => parameter.name)).toEqual([
      'Add 1', 'Add 2', 'Add 4', 'Add 8', 'Operation', 'Mode', 'Offset',
      'Shift source',
    ])
  })

  it('counts modulo 16 and emits a one-clock carry with weighted 0-10 V outputs', () => {
    runtime.init?.()

    for (let count = 1; count <= 15; count += 1) {
      const rising = outputVoltages(runtime.gate?.(1, true))
      expect(rising[1]).toBeCloseTo(count * 10 / 15)
      expect(rising[3]).toBe(0)
      runtime.gate?.(1, false)
    }

    const overflow = outputVoltages(runtime.gate?.(1, true))
    expect(overflow).toMatchObject({
      1: 0,
      2: 0,
      3: 10,
      4: 0,
      5: 0,
      6: 0,
      7: 0,
    })

    const released = outputVoltages(runtime.gate?.(1, false))
    expect(released[3]).toBe(0)
  })

  it('exposes the adder immediately in async mode and XORs the Sub input', () => {
    runtime.setParameters([2, 1, 1, 1, 1, 2, 1, 1])
    runtime.init?.()

    expect(outputVoltages(runtime.step?.(0.001, Array(11).fill(0)))[1])
      .toBeCloseTo(10 / 15)

    expect(outputVoltages(runtime.gate?.(4, true))[1]).toBeCloseTo(10 / 15)
    expect(outputVoltages(runtime.gate?.(5, true))[1]).toBeCloseTo(3 * 10 / 15)
    expect(outputVoltages(runtime.gate?.(3, true))[1]).toBeCloseTo(13 * 10 / 15)

    const clocked = outputVoltages(runtime.gate?.(1, true))
    expect(clocked[1]).toBeCloseTo(10 * 10 / 15)
  })

  it('resets the register without losing the current gate-input word', () => {
    runtime.setParameters([2, 1, 1, 1, 1, 2, 1, 1])
    runtime.init?.()
    runtime.gate?.(5, true)
    runtime.gate?.(1, true)
    runtime.gate?.(1, false)

    const reset = outputVoltages(runtime.trigger?.(2))
    expect(reset[1]).toBeCloseTo(3 * 10 / 15)
    expect(reset[6]).toBe(10)
    expect(reset[7]).toBe(10)
  })

  it('rotates by default and can replace the incoming shift bit with data', () => {
    runtime.init?.()
    runtime.setParameters([1, 1, 1, 2, 1, 1, 1, 1])
    runtime.gate?.(1, true)
    runtime.gate?.(1, false)
    runtime.gate?.(8, true)

    const rotated = outputVoltages(runtime.gate?.(1, true))
    expect(rotated[1]).toBeCloseTo(10 / 15)

    runtime.gate?.(1, false)
    runtime.trigger?.(2)
    runtime.setParameters([1, 1, 1, 1, 1, 1, 1, 2])
    runtime.gate?.(8, true)
    runtime.gate?.(9, true)
    const inserted = outputVoltages(runtime.gate?.(1, true))
    expect(inserted[1]).toBeCloseTo(10 / 15)
  })

  it('XORs Clock and Shift edges in async mode', () => {
    runtime.init?.()
    runtime.setParameters([1, 1, 1, 1, 1, 2, 1, 2])
    runtime.gate?.(9, true)

    expect(outputVoltages(runtime.gate?.(8, true))[1]).toBeCloseTo(10 / 15)
    expect(outputVoltages(runtime.gate?.(1, true))[1]).toBeCloseTo(10 / 15)
    expect(outputVoltages(runtime.gate?.(1, false))[1]).toBeCloseTo(3 * 10 / 15)
  })

  it('draws the four-bit word, stepped levels, mode, and carry inside the display', () => {
    runtime.init?.()
    runtime.gate?.(1, true)
    display.reset()
    expect(runtime.draw?.()).toBe(true)
    const commands = [...display.commands]

    expect(frameText(commands)).toEqual(expect.arrayContaining([
      'NIBBLER', 'ADD  SYNC', '8', '4', '2', '1', 'S1', 'S2', 'WORD 1', 'OFF 0',
    ]))
    expect(commands).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'box',
        fill: true,
        x1: 101,
        y1: 19,
        x2: 120,
        y2: 42,
        shade: 12,
      }),
    ]))
    expect(findFirstTextOverflow(commands)).toBeUndefined()
  })
})
