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
  join(process.cwd(), 'lua-scripts/fredi-bach/FM Control Voltage Helper.lua'),
  'utf8',
)

const defaultParameters = [1, 2, 5, 12]

async function createFmHelperHarness(parameters = defaultParameters) {
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

function advance(
  step: ((dt: number, inputs: number[]) => unknown) | undefined,
  milliseconds: number,
  inputVoltage = 0,
) {
  let output: unknown
  for (let i = 0; i < milliseconds; i += 1) {
    output = step?.(0.001, [inputVoltage])
  }
  return output
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
    } else if (command.kind === 'circle') {
      expect(command.x - command.radius).toBeGreaterThanOrEqual(0)
      expect(command.x + command.radius).toBeLessThan(DISTING_DISPLAY.width)
      expect(command.y - command.radius).toBeGreaterThanOrEqual(0)
      expect(command.y + command.radius).toBeLessThan(DISTING_DISPLAY.height)
    }
  }
}

function gearOutline(commands: DrawCommand[], x: number, y: number) {
  return commands.find((command) => (
    command.kind === 'circle'
    && command.smooth
    && command.x === x
    && command.y === y
    && command.radius > 7
  ))
}

function carrierSpoke(commands: DrawCommand[]) {
  return commands.find((command) => (
    command.kind === 'line'
    && command.smooth
    && command.shade === 8
    && Math.hypot(command.x1 - 38, command.y1 - 29) < 3
  ))
}

function firstOutputSpoke(commands: DrawCommand[]) {
  return commands.find((command) => (
    command.kind === 'line'
    && command.smooth
    && command.shade === 6
    && Math.hypot(command.x1 - 104, command.y1 - 17) < 3
  ))
}

describe('FM Control Voltage Helper display', () => {
  it('draws one carrier and four ratio gears without changing CV math', async () => {
    const { display, lua, runtime } = await createFmHelperHarness()

    try {
      const output = advance(runtime.step, 100, 0.25)
      const entries = callbackOutputEntries(output)

      expect(Number(entries?.find(([index]) => index === 1)?.[1]))
        .toBeCloseTo(0.25, 10)
      expect(Number(entries?.find(([index]) => index === 2)?.[1]))
        .toBeCloseTo(1.25, 10)
      expect(Number(entries?.find(([index]) => index === 3)?.[1]))
        .toBeCloseTo(0.25 + Math.log2(5), 10)
      expect(Number(entries?.find(([index]) => index === 4)?.[1]))
        .toBeCloseTo(0.25 + Math.log2(1.5), 10)

      const commands = drawFrame(display, runtime.draw)
      expect(frameText(commands)).toEqual(expect.arrayContaining([
        'IN',
        '+0.25V',
        '1:1',
        '2:1',
        '5:1',
        '3:2',
        '1 +0.000',
        '2 +1.000',
        '3 +2.322',
        '4 +0.585',
      ]))
      expect(gearOutline(commands, 38, 29)).toMatchObject({
        kind: 'circle',
        radius: 13.5,
        shade: 11,
      })
      expect(gearOutline(commands, 104, 17)).toBeDefined()
      expect(gearOutline(commands, 180, 17)).toBeDefined()
      expect(gearOutline(commands, 104, 41)).toBeDefined()
      expect(gearOutline(commands, 180, 41)).toBeDefined()
      expect(commands.filter((command) => (
        command.kind === 'line'
        && command.smooth
        && command.shade === 4
      ))).toHaveLength(4)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('counter-rotates ratio gears while the valid carrier input persists', async () => {
    const { display, lua, runtime } = await createFmHelperHarness()

    try {
      advance(runtime.step, 1, 0)
      const firstCommands = drawFrame(display, runtime.draw)
      const firstSpoke = carrierSpoke(firstCommands)

      advance(runtime.step, 250, 0)
      const laterCommands = drawFrame(display, runtime.draw)
      const laterSpoke = carrierSpoke(laterCommands)
      const laterOutputSpoke = firstOutputSpoke(laterCommands)

      expect(firstSpoke).toBeDefined()
      expect(laterSpoke).toBeDefined()
      expect(laterOutputSpoke).toBeDefined()
      if (firstSpoke?.kind === 'line' && laterSpoke?.kind === 'line') {
        expect(laterSpoke.x2).not.toBeCloseTo(firstSpoke.x2, 3)
        expect(laterSpoke.y2).not.toBeCloseTo(firstSpoke.y2, 3)
      }
      if (
        laterSpoke?.kind === 'line'
        && laterOutputSpoke?.kind === 'line'
      ) {
        expect(laterSpoke.y2).toBeGreaterThan(29)
        expect(laterOutputSpoke.y2).toBeLessThan(17)
      }
      expectFrameInsideDisplay(laterCommands)
    } finally {
      lua.global.close()
    }
  })

  it('uses ratio diameter and the shared ruler to express offset extremes', async () => {
    const { display, lua, runtime } = await createFmHelperHarness([8, 11, 1, 2])

    try {
      advance(runtime.step, 50, -5)
      const commands = drawFrame(display, runtime.draw)
      const highRatioGear = gearOutline(commands, 104, 17)
      const lowRatioGear = gearOutline(commands, 180, 17)

      expect(highRatioGear).toMatchObject({ kind: 'circle', radius: 7.5 })
      expect(lowRatioGear).toMatchObject({ kind: 'circle', radius: 10 })
      expect(frameText(commands)).toEqual(expect.arrayContaining([
        '8:1',
        '1:4',
        '1 +3.000',
        '2 -2.000',
      ]))
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'box',
          x1: 246,
          x2: 248,
          y1: 56,
          y2: 61,
          shade: 9,
        }),
        expect.objectContaining({
          kind: 'box',
          x1: 71,
          x2: 73,
          y1: 56,
          y2: 61,
          shade: 10,
        }),
      ]))
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('sends a short elapsed-time impulse down all four belts on a pitch jump', async () => {
    const { display, lua, runtime } = await createFmHelperHarness()

    try {
      advance(runtime.step, 1, 0)
      advance(runtime.step, 45, 1)
      const pulseCommands = drawFrame(display, runtime.draw)
      const impulses = pulseCommands.filter((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.radius === 2
      ))

      expect(impulses).toHaveLength(4)
      expect(impulses.every((command) => (
        command.kind === 'circle'
        && command.x > 50
        && command.x < 180
      ))).toBe(true)

      advance(runtime.step, 200, 1)
      const settledCommands = drawFrame(display, runtime.draw)
      expect(settledCommands.filter((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.radius === 2
      ))).toHaveLength(0)
      expectFrameInsideDisplay(pulseCommands)
      expectFrameInsideDisplay(settledCommands)
    } finally {
      lua.global.close()
    }
  })
})
