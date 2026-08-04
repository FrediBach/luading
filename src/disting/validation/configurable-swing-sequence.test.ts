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
  join(process.cwd(), 'lua-scripts/fredi-bach/Configurable Swing Sequence.lua'),
  'utf8',
)

const defaultParameters = [
  2,
  0, 20, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
  10,
]

async function createSwingHarness(parameters = defaultParameters) {
  const lua = await createDistingLuaTestEngine(50)
  const display = new DistingDisplayApi()
  display.register(lua.global)

  const runtime = await loadLuaProgramRuntime(lua, source)
  runtime.configure(2, 0)
  const rawInit = runtime.init?.()
  const init = rawInit && typeof rawInit === 'object'
    ? rawInit as LuaInitResult
    : {}
  const program = describeProgram(runtime.program, init)
  runtime.setParameters(parameters)

  return { display, lua, program, runtime }
}

function voltageAt(output: unknown, index = 1) {
  return callbackOutputEntries(output)?.find(([outputIndex]) => outputIndex === index)?.[1]
}

function advance(
  step: ((dt: number, inputs: number[]) => unknown) | undefined,
  milliseconds: number,
) {
  const events: Array<{ millisecond: number, voltage: number }> = []
  for (let millisecond = 1; millisecond <= milliseconds; millisecond += 1) {
    const output = voltageAt(step?.(0.001, [0, 0]))
    if (typeof output === 'number') events.push({ millisecond, voltage: output })
  }
  return events
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

describe('Configurable Swing Sequence', () => {
  it('declares a sixteen-position percentage pattern and trigger I/O', async () => {
    const { lua, program } = await createSwingHarness()

    try {
      expect(program.inputKinds).toEqual(['trigger', 'trigger'])
      expect(program.inputNames).toEqual(['Clock', 'Reset'])
      expect(program.outputNames).toEqual(['Swung Clock'])
      expect(program.parameters).toHaveLength(18)
      expect(program.parameters.map((parameter) => parameter.name)).toEqual([
        'Length',
        ...Array.from({ length: 16 }, (_, index) => `Step ${String(index + 1).padStart(2, '0')}`),
        'Pulse',
      ])
      expect(program.parameters.map((parameter) => parameter.value)).toEqual(defaultParameters)
    } finally {
      lua.global.close()
    }
  })

  it('turns { 0, 0.2 } into alternating straight and twenty-percent-delayed clocks', async () => {
    const { lua, runtime } = await createSwingHarness()

    try {
      expect(voltageAt(runtime.trigger?.(1))).toBe(5)
      expect(advance(runtime.step, 100)).toContainEqual({ millisecond: 10, voltage: 0 })

      expect(callbackOutputEntries(runtime.trigger?.(1))).toEqual([])
      const delayedSecond = advance(runtime.step, 20)
      expect(delayedSecond).toContainEqual({ millisecond: 20, voltage: 5 })

      advance(runtime.step, 80)
      expect(voltageAt(runtime.trigger?.(1))).toBe(5)
      advance(runtime.step, 100)
      expect(callbackOutputEntries(runtime.trigger?.(1))).toEqual([])
      expect(advance(runtime.step, 20)).toContainEqual({ millisecond: 20, voltage: 5 })
    } finally {
      lua.global.close()
    }
  })

  it('loops an independently configured four-step timing sequence', async () => {
    const parameters = [...defaultParameters]
    parameters[0] = 4
    parameters[1] = 0
    parameters[2] = 0
    parameters[3] = 20
    parameters[4] = 0
    const { lua, runtime } = await createSwingHarness(parameters)

    try {
      expect(voltageAt(runtime.trigger?.(1))).toBe(5)
      advance(runtime.step, 100)
      expect(voltageAt(runtime.trigger?.(1))).toBe(5)
      advance(runtime.step, 100)

      expect(callbackOutputEntries(runtime.trigger?.(1))).toEqual([])
      expect(advance(runtime.step, 19).some(({ voltage }) => voltage === 5)).toBe(false)
      expect(advance(runtime.step, 1)).toEqual([{ millisecond: 1, voltage: 5 }])

      advance(runtime.step, 80)
      expect(voltageAt(runtime.trigger?.(1))).toBe(5)
      advance(runtime.step, 100)
      expect(voltageAt(runtime.trigger?.(1))).toBe(5)
    } finally {
      lua.global.close()
    }
  })

  it('cancels pending clocks and restarts the pattern at step one on reset', async () => {
    const parameters = [...defaultParameters]
    parameters[1] = 10
    parameters[2] = 40
    const { lua, runtime } = await createSwingHarness(parameters)

    try {
      runtime.trigger?.(1)
      advance(runtime.step, 100)
      runtime.trigger?.(1)
      advance(runtime.step, 10)

      expect(voltageAt(runtime.trigger?.(2))).toBe(0)
      expect(advance(runtime.step, 40).some(({ voltage }) => voltage === 5)).toBe(false)

      expect(callbackOutputEntries(runtime.trigger?.(1))).toEqual([])
      expect(advance(runtime.step, 9).some(({ voltage }) => voltage === 5)).toBe(false)
      expect(advance(runtime.step, 1)).toEqual([{ millisecond: 1, voltage: 5 }])
    } finally {
      lua.global.close()
    }
  })

  it('draws a bounded overview of long timing patterns and the active step', async () => {
    const parameters = [...defaultParameters]
    parameters[0] = 16
    for (let index = 1; index <= 16; index += 1) parameters[index] = (index - 1) * 6
    const { display, lua, runtime } = await createSwingHarness(parameters)

    try {
      runtime.trigger?.(1)
      advance(runtime.step, 125)
      runtime.trigger?.(1)
      const commands = drawFrame(display, runtime.draw)
      const texts = frameText(commands)

      expect(texts).toEqual(expect.arrayContaining([
        'L16',
        '125ms',
        'STEP 02',
        '+6%',
      ]))
      expect(commands.filter((command) => command.kind === 'box' && command.fill)).toHaveLength(16)
      expect(commands).toContainEqual(expect.objectContaining({
        kind: 'box',
        x1: 21,
        y1: 20,
        x2: 34,
        y2: 54,
        shade: 11,
      }))
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })
})
