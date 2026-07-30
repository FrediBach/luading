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
  join(process.cwd(), 'lua-scripts/fredi-bach/Euclidean Gate Skip Algorithm.lua'),
  'utf8',
)

const defaultParameters = [16, 4, 0, 100]

async function createGateSkipHarness(parameters = defaultParameters) {
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

function advance(
  step: ((dt: number, inputs: number[]) => unknown) | undefined,
  milliseconds: number,
) {
  let output: unknown
  for (let i = 0; i < milliseconds; i += 1) {
    output = step?.(0.001, [0, 0])
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

function travellingTokens(commands: DrawCommand[]) {
  return commands.filter((command) => (
    command.kind === 'circle'
    && command.smooth
    && command.radius === 2
  ))
}

describe('Euclidean Gate Skip display', () => {
  it('rests as a Euclidean wheel feeding two complementary bins', async () => {
    const { display, lua, runtime } = await createGateSkipHarness()

    try {
      advance(runtime.step, 1000)
      const commands = drawFrame(display, runtime.draw)
      const texts = frameText(commands)

      expect(texts).toEqual(expect.arrayContaining([
        'OUT',
        'SKIP',
        'R --',
        'E(4,16)',
        '-/16',
        'P 100%',
      ]))
      expect(commands.filter((command) => (
        command.kind === 'box'
        && command.fill
        && command.x1 < 100
      ))).toHaveLength(4)
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'circle',
          x: 79,
          y: 31,
          radius: 20,
          shade: 3,
        }),
        expect.objectContaining({
          kind: 'circle',
          x: 148,
          y: 21,
          radius: 3,
          shade: 12,
          smooth: true,
        }),
      ]))
      expect(travellingTokens(commands)).toHaveLength(0)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('rotates across a rest before releasing a later pattern hit', async () => {
    const { display, lua, runtime } = await createGateSkipHarness([8, 3, 0, 100])

    try {
      advance(runtime.step, 1)
      const restOutput = callbackOutputEntries(runtime.gate?.(1, true))
      expect(restOutput).toEqual([[1, 0], [2, 0]])
      runtime.gate?.(1, false)
      advance(runtime.step, 50)
      const restCommands = drawFrame(display, runtime.draw)

      expect(frameText(restCommands)).toEqual(expect.arrayContaining([
        'R --',
        '1/8',
      ]))
      expect(travellingTokens(restCommands)).toHaveLength(0)

      runtime.gate?.(1, true)
      runtime.gate?.(1, false)
      advance(runtime.step, 1)
      const hitOutput = callbackOutputEntries(runtime.gate?.(1, true))
      expect(hitOutput).toEqual([[1, 5], [2, 0]])
      advance(runtime.step, 50)
      const hitCommands = drawFrame(display, runtime.draw)

      expect(frameText(hitCommands)).toEqual(expect.arrayContaining([
        'R 1:0',
        '3/8',
      ]))
      expect(travellingTokens(hitCommands).some((command) => (
        command.kind === 'circle'
        && command.x > 99
        && command.x < 148
      ))).toBe(true)
      expectFrameInsideDisplay(restCommands)
      expectFrameInsideDisplay(hitCommands)
    } finally {
      lua.global.close()
    }
  })

  it('sends passed and skipped hits down independent fork branches', async () => {
    const { display, lua, runtime } = await createGateSkipHarness([8, 8, 0, 100])

    try {
      advance(runtime.step, 1)
      const passOutput = callbackOutputEntries(runtime.gate?.(1, true))
      expect(passOutput).toEqual([[1, 5], [2, 0]])
      advance(runtime.step, 220)
      const passCommands = drawFrame(display, runtime.draw)
      const passToken = travellingTokens(passCommands)[0]

      expect(frameText(passCommands)).toContain('R 1:0')
      expect(passToken).toBeDefined()
      if (passToken?.kind === 'circle') {
        expect(passToken.y).toBeLessThan(31)
      }
      expect(callbackOutputEntries(runtime.gate?.(1, false)))
        .toEqual([[1, 0], [2, 0]])

      runtime.setParameter?.(4, 0)
      advance(runtime.step, 1000)
      runtime.gate?.(1, true)
      advance(runtime.step, 220)
      const skipCommands = drawFrame(display, runtime.draw)
      const skipTokens = travellingTokens(skipCommands)

      expect(frameText(skipCommands)).toEqual(expect.arrayContaining([
        'R 1:1',
        'P 0%',
      ]))
      expect(skipTokens.some((command) => (
        command.kind === 'circle'
        && command.y > 31
      ))).toBe(true)
      const skipPivot = skipCommands.find((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.x === 148
        && command.radius === 3
        && command.shade === 12
      ))
      expect(skipPivot).toBeDefined()
      if (skipPivot?.kind === 'circle') {
        expect(skipPivot.y).toBeGreaterThan(43.99)
      }
      expectFrameInsideDisplay(passCommands)
      expectFrameInsideDisplay(skipCommands)
    } finally {
      lua.global.close()
    }
  })

  it('keeps only the twelve most recent hit decisions and clears them on reset', async () => {
    const { display, lua, runtime } = await createGateSkipHarness([4, 4, 0, 100])

    try {
      advance(runtime.step, 1)
      for (let i = 0; i < 12; i += 1) {
        runtime.gate?.(1, true)
        runtime.gate?.(1, false)
        advance(runtime.step, 1)
      }

      runtime.setParameter?.(4, 0)
      advance(runtime.step, 1000)
      for (let i = 0; i < 12; i += 1) {
        runtime.gate?.(1, true)
        runtime.gate?.(1, false)
        advance(runtime.step, 1)
      }

      const commands = drawFrame(display, runtime.draw)
      expect(frameText(commands)).toContain('R 0:12')
      expect(travellingTokens(commands).length).toBeLessThanOrEqual(6)

      runtime.trigger?.(2)
      const resetCommands = drawFrame(display, runtime.draw)
      expect(frameText(resetCommands)).toEqual(expect.arrayContaining([
        'R --',
        '-/4',
      ]))
      expect(travellingTokens(resetCommands)).toHaveLength(0)
      expectFrameInsideDisplay(commands)
      expectFrameInsideDisplay(resetCommands)
    } finally {
      lua.global.close()
    }
  })

  it('rotates Offset under the playhead and stays bounded at 32 steps', async () => {
    const { display, lua, runtime } = await createGateSkipHarness([32, 7, 31, 50])

    try {
      advance(runtime.step, 1000)
      runtime.gate?.(1, true)
      advance(runtime.step, 90)
      const commands = drawFrame(display, runtime.draw)

      expect(frameText(commands)).toEqual(expect.arrayContaining([
        'E(7,32)',
        '1/32',
        'P 50%',
      ]))
      expect(commands.filter((command) => (
        command.kind === 'box'
        && command.fill
        && command.x1 < 100
      ))).toHaveLength(7)
      expect(commands.length).toBeLessThan(90)

      runtime.setParameter?.(1, 4)
      runtime.setParameter?.(2, 2)
      advance(runtime.step, 1)
      const reducedCommands = drawFrame(display, runtime.draw)
      expectFrameInsideDisplay(commands)
      expectFrameInsideDisplay(reducedCommands)
    } finally {
      lua.global.close()
    }
  })
})
