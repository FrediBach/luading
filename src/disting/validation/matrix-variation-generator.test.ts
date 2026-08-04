/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { callbackOutputEntries } from '../emulation/callback-output'
import { DistingDisplayApi } from '../emulation/display-api'
import { findFirstTextOverflow } from '../emulation/display-bounds'
import {
  describeProgram,
  type LuaInitResult,
} from '../emulation/lua-contract'
import { loadLuaProgramRuntime } from '../emulation/lua-runtime'
import { createDistingLuaTestEngine } from '../testing/lua-test-environment'
import { DISTING_DISPLAY, type DrawCommand } from '../types'

const source = readFileSync(
  join(process.cwd(), 'lua-scripts/fredi-bach/Matrix Variation Generator.lua'),
  'utf8',
)

const defaultParameters = [0, 0, 25]

async function createMatrixHarness(parameters = defaultParameters) {
  const lua = await createDistingLuaTestEngine(50)
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

function outputVoltages(output: unknown) {
  const voltages = Array.from({ length: 10 }, () => 0)
  for (const [index, voltage] of callbackOutputEntries(output) ?? []) {
    if (typeof voltage === 'number') voltages[index - 1] = voltage
  }
  return voltages
}

function drawFrame(
  display: DistingDisplayApi,
  draw: (() => unknown) | undefined,
) {
  display.reset()
  expect(draw?.()).toBe(true)
  return [...display.commands]
}

function frameText(commands: DrawCommand[]) {
  return commands
    .filter((command) => command.kind === 'text')
    .map((command) => command.text)
}

function expectFrameInsideDisplay(commands: DrawCommand[]) {
  expect(findFirstTextOverflow(commands)).toBeUndefined()

  for (const command of commands) {
    if (command.kind === 'line') {
      expect(Math.min(command.x1, command.x2)).toBeGreaterThanOrEqual(0)
      expect(Math.max(command.x1, command.x2)).toBeLessThan(DISTING_DISPLAY.width)
      expect(Math.min(command.y1, command.y2)).toBeGreaterThanOrEqual(0)
      expect(Math.max(command.y1, command.y2)).toBeLessThan(DISTING_DISPLAY.height)
    } else if (command.kind === 'box') {
      expect(Math.min(command.x1, command.x2)).toBeGreaterThanOrEqual(0)
      expect(Math.max(command.x1, command.x2)).toBeLessThan(DISTING_DISPLAY.width)
      expect(Math.min(command.y1, command.y2)).toBeGreaterThanOrEqual(0)
      expect(Math.max(command.y1, command.y2)).toBeLessThan(DISTING_DISPLAY.height)
    }
  }
}

describe('Matrix Variation Generator', () => {
  it('declares the typed matrix controls, ten stepped lanes, and offsets', async () => {
    const { lua, program } = await createMatrixHarness()

    try {
      expect(program.inputKinds).toEqual(['trigger', 'trigger', 'cv', 'cv'])
      expect(program.inputNames).toEqual(['Clock', 'Reset', 'Row CV', 'Column CV'])
      expect(program.outputKinds).toEqual(Array.from({ length: 10 }, () => 'stepped'))
      expect(program.outputNames).toEqual(
        Array.from({ length: 10 }, (_, index) => `Lane ${index + 1}`),
      )
      expect(program.parameters.map((parameter) => ({
        name: parameter.name,
        value: parameter.value,
      }))).toEqual([
        { name: 'Row Offset', value: 0 },
        { name: 'Column Offset', value: 0 },
        { name: 'Pulse', value: 25 },
      ])
    } finally {
      lua.global.close()
    }
  })

  it('reads the first matrix column on the first clock', async () => {
    const { lua, runtime } = await createMatrixHarness()

    try {
      runtime.trigger?.(1)
      expect(outputVoltages(runtime.step?.(0.001, [0, 0, 0, 0]))).toEqual([
        5, 0, 5, 0, 5, 5, 0, 5, 0, 5,
      ])

      runtime.trigger?.(1)
      expect(outputVoltages(runtime.step?.(0.001, [0, 0, 0, 0]))).toEqual([
        0, 0, 0, 5, 0, 0, 5, 5, 0, 0,
      ])
    } finally {
      lua.global.close()
    }
  })

  it('combines parameter and current-step CV rotation with wrapping', async () => {
    const { lua, runtime } = await createMatrixHarness([9, 15, 25])

    try {
      runtime.trigger?.(1)
      expect(outputVoltages(runtime.step?.(0.001, [0, 0, 1, 1]))).toEqual([
        5, 0, 5, 0, 5, 5, 0, 5, 0, 5,
      ])

      runtime.trigger?.(1)
      expect(outputVoltages(runtime.step?.(0.001, [0, 0, -1, -1]))).toEqual([
        0, 0, 0, 0, 0, 5, 0, 5, 0, 0,
      ])
    } finally {
      lua.global.close()
    }
  })

  it('turns pulses off and makes simultaneous reset and clock emit step one', async () => {
    const { lua, runtime } = await createMatrixHarness([0, 0, 3])

    try {
      runtime.trigger?.(1)
      runtime.step?.(0.001, [0, 0, 0, 0])
      expect(callbackOutputEntries(runtime.step?.(0.001, [0, 0, 0, 0])) ?? []).toEqual([])
      expect(callbackOutputEntries(runtime.step?.(0.001, [0, 0, 0, 0])) ?? []).toEqual([])
      expect(outputVoltages(runtime.step?.(0.001, [0, 0, 0, 0]))).toEqual(
        Array.from({ length: 10 }, () => 0),
      )

      runtime.trigger?.(1)
      runtime.step?.(0.001, [0, 0, 0, 0])
      runtime.trigger?.(2)
      runtime.trigger?.(1)
      expect(outputVoltages(runtime.step?.(0.001, [0, 0, 0, 0]))).toEqual([
        5, 0, 5, 0, 5, 5, 0, 5, 0, 5,
      ])
    } finally {
      lua.global.close()
    }
  })

  it('draws a bounded shifted matrix and current playback state', async () => {
    const { display, lua, runtime } = await createMatrixHarness([3, 5, 120])

    try {
      runtime.trigger?.(1)
      runtime.step?.(0.001, [0, 0, 2, -2])
      const commands = drawFrame(display, runtime.draw)

      expect(frameText(commands)).toEqual(expect.arrayContaining([
        'MATRIX VARIATION',
        'STEP 01 > 04',
        'ROW   +5',
        'COLUMN +3',
        'PULSE  120ms',
        'FIRING',
      ]))
      expect(commands.filter((command) => command.kind === 'box' && command.fill))
        .toHaveLength(53)
      expect(commands).toContainEqual(expect.objectContaining({
        kind: 'box',
        x1: 18,
        y1: 12,
        x2: 22,
        y2: 15,
        shade: 7,
      }))
      expect(commands).toContainEqual(expect.objectContaining({
        kind: 'box',
        fill: false,
        x1: 3,
        y1: 11,
        x2: 9,
        y2: 61,
        shade: 15,
      }))
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })
})
