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
import { DISTING_DISPLAY, type DrawCommand } from '../types'

const source = readFileSync(
  join(process.cwd(), 'lua-scripts/fredi-bach/Melody Range Quantizer.lua'),
  'utf8',
)

function voltageAt(value: unknown, index = 1) {
  return callbackOutputEntries(value)?.find(([outputIndex]) => outputIndex === index)?.[1]
}

function frameText(commands: DrawCommand[]) {
  return commands
    .filter((command) => command.kind === 'text')
    .map((command) => command.text)
}

describe('Melody Range Quantizer', () => {
  let display: DistingDisplayApi
  let lua: Awaited<ReturnType<typeof createDistingLuaTestEngine>>
  let runtime: LuaProgramRuntime

  beforeEach(async () => {
    lua = await createDistingLuaTestEngine(50)
    display = new DistingDisplayApi()
    display.register(lua.global)
    runtime = await loadLuaProgramRuntime(lua, source)
    runtime.configure(1, 0)
  })

  afterEach(() => {
    lua.global.close()
  })

  it('declares pitch, gate, and independent range CV controls', () => {
    const rawInit = runtime.init?.()
    const init = rawInit && typeof rawInit === 'object' ? rawInit as LuaInitResult : {}
    const program = describeProgram(runtime.program, init)

    expect(program.name).toBe('Melody Range Quantizer')
    expect(program.inputKinds).toEqual(['cv', 'gate', 'cv', 'cv'])
    expect(program.inputNames).toEqual(['Pitch', 'Gate', 'Min CV', 'Max CV'])
    expect(program.outputKinds).toEqual(['stepped', 'stepped'])
    expect(program.outputNames).toEqual(['Pitch', 'Gate'])
    expect(program.parameters.map((parameter) => [parameter.name, parameter.value])).toEqual([
      ['Min Note', 60],
      ['Max Note', 60],
      ['Min CV Amt', -100],
      ['Max CV Amt', 100],
    ])
  })

  it('quantizes notes to semitones and clamps them to the selected range', () => {
    runtime.init?.()
    runtime.setParameters([48, 72, 0, 0])

    expect(voltageAt(runtime.step?.(0.001, [-2, 0, 0, 0]))).toBe(-1)
    expect(voltageAt(runtime.step?.(0.001, [0.14, 0, 0, 0])))
      .toBeCloseTo(2 / 12)
    expect(voltageAt(runtime.step?.(0.001, [2, 0, 0, 0]))).toBe(1)
  })

  it('opens a closed range downward and upward from positive CV', () => {
    runtime.init?.()
    runtime.setParameters([60, 60, -100, 100])

    expect(voltageAt(runtime.step?.(0.001, [-1, 0, 0, 0]))).toBe(0)
    expect(voltageAt(runtime.step?.(0.001, [-1, 0, 1, 1]))).toBe(-1)
    expect(voltageAt(runtime.step?.(0.001, [1, 0, 1, 1]))).toBe(1)
  })

  it('passes gate edges through on the second output', () => {
    runtime.init?.()

    expect(voltageAt(runtime.gate?.(2, true), 2)).toBe(5)
    expect(voltageAt(runtime.gate?.(2, false), 2)).toBe(0)
  })

  it('shows the active range and clamped note inside the display', () => {
    runtime.init?.()
    runtime.setParameters([60, 60, -100, 100])
    runtime.step?.(0.001, [2, 0, 1, 1])
    runtime.gate?.(2, true)

    display.reset()
    expect(runtime.draw?.()).toBe(true)
    const commands = [...display.commands]

    expect(frameText(commands)).toEqual(expect.arrayContaining([
      'MELODY RANGE',
      'C3 - C5',
      'IN C6',
      'OUT C5',
    ]))
    expect(commands).toContainEqual(expect.objectContaining({
      kind: 'circle',
      x: 246,
      y: 8,
      radius: 4,
      shade: 15,
    }))
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
