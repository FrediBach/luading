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
  join(process.cwd(), 'lua-scripts/fredi-bach/Cat Purr Synthesizer.lua'),
  'utf8',
)

const defaultParameters = [30, 18, 75, 30, 0, 20, 60, 10, 1]

async function createCatPurrHarness(parameters = defaultParameters) {
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
  runtime.setParameters(parameters)

  return { display, lua, program, runtime }
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

function outputWhiskers(commands: DrawCommand[]) {
  return commands.filter((command) => (
    command.kind === 'line'
    && command.smooth
    && command.x1 === 211
  ))
}

describe('Cat Purr display', () => {
  it('draws the breathing cat, curled tail, throat, and three output whiskers', async () => {
    const { display, lua, runtime } = await createCatPurrHarness()

    try {
      for (let i = 0; i < 500; i += 1) {
        runtime.step?.(0.001, [0])
      }
      const commands = drawFrame(display, runtime.draw)
      const texts = frameText(commands)

      expect(texts).toEqual(expect.arrayContaining([
        'P',
        'F',
        'A',
        'FREE',
        'RUN',
      ]))
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'circle',
          smooth: true,
          x: 71,
          y: 32,
          radius: 11,
        }),
      ]))
      expect(outputWhiskers(commands)).toHaveLength(3)
      expect(commands.filter((command) => (
        command.kind === 'line'
        && command.smooth
        && command.x1 >= 79
        && command.x2 <= 97
      )).length).toBeGreaterThanOrEqual(12)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('opens its eyes at gated rest and closes them while running', async () => {
    const gatedParameters = [...defaultParameters]
    gatedParameters[8] = 2
    const { display, lua, runtime } = await createCatPurrHarness(gatedParameters)

    try {
      for (let i = 0; i < 100; i += 1) {
        runtime.step?.(0.001, [0])
      }
      const stoppedCommands = drawFrame(display, runtime.draw)

      expect(frameText(stoppedCommands)).toEqual(expect.arrayContaining([
        'GATED',
        'STOP',
      ]))
      expect(stoppedCommands.filter((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.radius === 1.5
        && (command.x === 66 || command.x === 75)
      ))).toHaveLength(2)

      runtime.gate?.(1, true)
      for (let i = 0; i < 20; i += 1) {
        runtime.step?.(0.001, [5])
      }
      const runningCommands = drawFrame(display, runtime.draw)

      expect(frameText(runningCommands)).toEqual(expect.arrayContaining([
        'GATED',
        'RUN',
      ]))
      expect(runningCommands.filter((command) => (
        command.kind === 'line'
        && command.smooth
        && command.y1 === 29
        && command.y2 === 29
      ))).toEqual(expect.arrayContaining([
        expect.objectContaining({ x1: 64, x2: 68 }),
        expect.objectContaining({ x1: 73, x2: 77 }),
      ]))
      expectFrameInsideDisplay(stoppedCommands)
      expectFrameInsideDisplay(runningCommands)
    } finally {
      lua.global.close()
    }
  })

  it('latches a Purr Gate event long enough to flash the output whiskers', async () => {
    const gatedParameters = [...defaultParameters]
    gatedParameters[8] = 2
    const { display, lua, runtime } = await createCatPurrHarness(gatedParameters)

    try {
      runtime.gate?.(1, true)
      let output: unknown
      for (let i = 0; i < 20; i += 1) {
        output = runtime.step?.(0.001, [5])
      }
      expect(callbackOutputEntries(output)?.find(([index]) => index === 4)?.[1])
        .toBe(5)

      runtime.gate?.(1, false)
      for (let i = 0; i < 20; i += 1) {
        runtime.step?.(0.001, [0])
      }
      const flashedCommands = drawFrame(display, runtime.draw)
      const flashedTips = outputWhiskers(flashedCommands).map((command) => (
        command.kind === 'line' ? command.x2 : 0
      ))

      for (let i = 0; i < 160; i += 1) {
        runtime.step?.(0.001, [0])
      }
      const settledCommands = drawFrame(display, runtime.draw)
      const settledTips = outputWhiskers(settledCommands).map((command) => (
        command.kind === 'line' ? command.x2 : 0
      ))

      expect(flashedTips).toHaveLength(3)
      expect(settledTips).toHaveLength(3)
      flashedTips.forEach((tip, index) => {
        expect(tip).toBeGreaterThan(settledTips[index])
      })
      expectFrameInsideDisplay(flashedCommands)
      expectFrameInsideDisplay(settledCommands)
    } finally {
      lua.global.close()
    }
  })
})
