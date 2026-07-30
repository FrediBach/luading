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
  join(process.cwd(), 'lua-scripts/fredi-bach/Complexity CV Generator.lua'),
  'utf8',
)

const defaultParameters = [20, 500, 200, 0, 8, 1, 1, 50, 5, 1]

async function createComplexityHarness(parameters = defaultParameters) {
  const lua = await createDistingLuaTestEngine(50)
  const display = new DistingDisplayApi()
  display.register(lua.global)

  const runtime = await loadLuaProgramRuntime(lua, source)
  runtime.configure(8, 0)
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
) {
  let output: unknown
  for (let i = 0; i < milliseconds; i += 1) {
    output = step?.(0.001, [0, 0, 0, 0, 0, 0, 0, 0])
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

function droplets(commands: DrawCommand[]) {
  return commands.filter((command) => (
    command.kind === 'circle'
    && command.smooth
    && command.x >= 16
    && command.x <= 184
    && command.y < 31
  ))
}

describe('Complexity CV display', () => {
  it('draws eight pipes feeding an empty shared reservoir', async () => {
    const { display, lua, runtime } = await createComplexityHarness()

    try {
      advance(runtime.step, 1)
      const commands = drawFrame(display, runtime.draw)
      const texts = frameText(commands)
      const pipeWalls = commands.filter((command) => (
        command.kind === 'line'
        && !command.smooth
        && command.y1 === 14
        && command.y2 === 31
        && command.shade === 2
      ))

      expect(texts).toEqual(expect.arrayContaining([
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
        '7',
        '8',
        '0%',
        '+0.00V',
        'STD',
      ]))
      expect(pipeWalls).toHaveLength(16)
      expect(droplets(commands)).toHaveLength(0)
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'box',
          x1: 7,
          y1: 31,
          x2: 200,
          y2: 54,
          shade: 4,
          fill: false,
        }),
      ]))
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('carries a rising gate droplet down its fading activity pipe', async () => {
    const { display, lua, runtime } = await createComplexityHarness()

    try {
      runtime.gate?.(3, true)
      advance(runtime.step, 10)
      const earlyCommands = drawFrame(display, runtime.draw)
      const earlyDroplet = droplets(earlyCommands).find((command) => (
        command.kind === 'circle' && command.x === 64
      ))

      runtime.gate?.(3, false)
      advance(runtime.step, 100)
      const laterCommands = drawFrame(display, runtime.draw)
      const laterDroplet = droplets(laterCommands).find((command) => (
        command.kind === 'circle' && command.x === 64
      ))

      expect(earlyDroplet).toBeDefined()
      expect(laterDroplet).toBeDefined()
      if (
        earlyDroplet?.kind === 'circle'
        && laterDroplet?.kind === 'circle'
      ) {
        expect(laterDroplet.y).toBeGreaterThan(earlyDroplet.y)
        expect(laterDroplet.shade).toBeLessThan(earlyDroplet.shade)
      }
      expect(laterCommands.some((command) => (
        command.kind === 'line'
        && command.x1 === 64
        && command.x2 === 64
        && command.y2 === 30
        && command.shade === 4
      ))).toBe(true)
      expectFrameInsideDisplay(earlyCommands)
      expectFrameInsideDisplay(laterCommands)
    } finally {
      lua.global.close()
    }
  })

  it('fills the tank, opens the valve, and flashes on a threshold crossing', async () => {
    const parameters = [1, 500, 200, 0, 8, 1, 1, 20, 0, 1]
    const { display, lua, runtime } = await createComplexityHarness(parameters)

    try {
      for (let input = 1; input <= 8; input += 1) {
        runtime.gate?.(input, true)
      }
      const output = advance(runtime.step, 5)
      const entries = callbackOutputEntries(output)

      expect(entries?.find(([index]) => index === 1)?.[1]).toBe(8)
      expect(entries?.find(([index]) => index === 2)?.[1]).toBe(5)

      const commands = drawFrame(display, runtime.draw)
      expect(frameText(commands)).toEqual(expect.arrayContaining([
        '100%',
        '+8.00V',
        'STD',
      ]))
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'box',
          x1: 205,
          y1: 36,
          x2: 211,
          y2: 40,
          shade: 15,
          fill: true,
        }),
      ]))
      expect(commands.some((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.x > 218
        && command.y === 38
        && command.radius === 2.2
      ))).toBe(true)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('flips the outlet indicator in inverted Ambient mode', async () => {
    const parameters = [...defaultParameters]
    parameters[6] = 2
    parameters[9] = 3
    const { display, lua, runtime } = await createComplexityHarness(parameters)

    try {
      const output = advance(runtime.step, 1)
      expect(callbackOutputEntries(output)?.find(([index]) => index === 1)?.[1])
        .toBe(8)

      const commands = drawFrame(display, runtime.draw)
      expect(frameText(commands)).toEqual(expect.arrayContaining([
        'AMB',
        '0%',
        '+8.00V',
      ]))
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'box',
          x1: 204,
          y1: 45,
          x2: 212,
          y2: 51,
          shade: 5,
          fill: false,
        }),
        expect.objectContaining({
          kind: 'line',
          x1: 200,
          y1: 48,
          x2: 204,
          y2: 48,
        }),
      ]))
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })
})
