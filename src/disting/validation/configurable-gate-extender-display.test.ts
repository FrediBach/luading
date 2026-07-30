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
  join(process.cwd(), 'lua-scripts/fredi-bach/Configurable Gate Extender.lua'),
  'utf8',
)

const defaultParameters = [100, 0, 10]

async function createGateExtenderHarness(parameters = defaultParameters) {
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

function advance(
  step: ((dt: number, inputs: number[]) => unknown) | undefined,
  milliseconds: number,
  cv = 0,
) {
  let output: unknown
  for (let i = 0; i < milliseconds; i += 1) {
    output = step?.(0.001, [0, cv])
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

describe('Configurable Gate Extender display', () => {
  it('rests between two pegs with compact timing telemetry', async () => {
    const { display, lua, runtime } = await createGateExtenderHarness()

    try {
      advance(runtime.step, 1000)
      const commands = drawFrame(display, runtime.draw)

      expect(frameText(commands)).toEqual(expect.arrayContaining([
        'EXT 100ms',
        'IDLE',
        'GAP 10ms',
      ]))
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'circle',
          x: 28,
          y: 34,
          radius: 3,
          shade: 8,
        }),
        expect.objectContaining({
          kind: 'circle',
          x: 226,
          y: 34,
          radius: 3,
          shade: 8,
        }),
      ]))
      expect(commands.filter((command) => (
        command.kind === 'line'
        && command.smooth
        && command.shade === 2
      ))).toHaveLength(24)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('dims the leading strip after input fall while holding the output taut', async () => {
    const { display, lua, runtime } = await createGateExtenderHarness()

    try {
      advance(runtime.step, 500)
      const riseOutput = callbackOutputEntries(runtime.gate?.(1, true))
      expect(riseOutput?.find(([index]) => index === 1)?.[1]).toBe(5)
      advance(runtime.step, 20)
      runtime.gate?.(1, false)
      advance(runtime.step, 30)

      const commands = drawFrame(display, runtime.draw)
      const texts = frameText(commands)

      expect(texts).toContain('HIGH')
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'line',
          x1: 72,
          y1: 27,
          x2: 72,
          y2: 42,
          shade: 8,
        }),
        expect.objectContaining({
          kind: 'circle',
          x: 226,
          y: 34,
          radius: 3,
          shade: 15,
        }),
      ]))
      expect(commands.some((command) => (
        command.kind === 'line'
        && command.smooth
        && command.shade === 4
      ))).toBe(true)
      expect(commands.some((command) => (
        command.kind === 'line'
        && command.smooth
        && command.shade === 13
      ))).toBe(true)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('retracts through the protected gap and shows a rejected input bump', async () => {
    const { display, lua, runtime } = await createGateExtenderHarness([20, 0, 100])

    try {
      advance(runtime.step, 500)
      runtime.gate?.(1, true)
      advance(runtime.step, 10)
      runtime.gate?.(1, false)
      advance(runtime.step, 21)

      expect(callbackOutputEntries(runtime.gate?.(1, true))).toEqual([])
      advance(runtime.step, 20)
      const commands = drawFrame(display, runtime.draw)

      expect(frameText(commands)).toContain('GAP')
      expect(commands.some((command) => (
        command.kind === 'line'
        && command.smooth
        && command.shade === 10
      ))).toBe(true)
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'circle',
          smooth: true,
          x: 36,
          radius: 1.5,
        }),
        expect.objectContaining({
          kind: 'circle',
          smooth: false,
          x: 226,
          y: 34,
          radius: 3,
          shade: 8,
        }),
      ]))
      expect(commands.filter((command) => (
        command.kind === 'line'
        && !command.smooth
        && command.shade === 5
        && command.y1 === 31
        && command.y2 === 37
      )).length).toBeGreaterThan(3)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('bends with bipolar CV and smooths the effective extension marker', async () => {
    const { display, lua, runtime } = await createGateExtenderHarness([100, 100, 10])

    try {
      advance(runtime.step, 1000, 5)
      const positiveCommands = drawFrame(display, runtime.draw)
      const positiveMidpoint = positiveCommands.find((command) => (
        command.kind === 'line'
        && command.smooth
        && command.shade === 2
        && command.x2 === 127
      ))

      expect(frameText(positiveCommands)).toContain('EXT 1100ms')
      expect(positiveMidpoint).toBeDefined()
      if (positiveMidpoint?.kind === 'line') {
        expect(positiveMidpoint.y2).toBeLessThan(29)
      }

      advance(runtime.step, 1000, -5)
      const negativeCommands = drawFrame(display, runtime.draw)
      const negativeMidpoint = negativeCommands.find((command) => (
        command.kind === 'line'
        && command.smooth
        && command.shade === 2
        && command.x2 === 127
      ))

      expect(frameText(negativeCommands)).toContain('EXT 0ms')
      expect(negativeMidpoint).toBeDefined()
      if (negativeMidpoint?.kind === 'line') {
        expect(negativeMidpoint.y2).toBeGreaterThan(39)
      }
      expectFrameInsideDisplay(positiveCommands)
      expectFrameInsideDisplay(negativeCommands)
    } finally {
      lua.global.close()
    }
  })
})
