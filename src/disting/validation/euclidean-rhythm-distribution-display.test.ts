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
  join(process.cwd(), 'lua-scripts/fredi-bach/Euclidean Rhythm Distribution.lua'),
  'utf8',
)

const defaultParameters = [8, 3, 50, 0, 10]

async function createDistributionHarness(parameters = defaultParameters) {
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
  distributionCv = 0,
) {
  let output: unknown
  for (let i = 0; i < milliseconds; i += 1) {
    output = step?.(0.001, [0, 0, distributionCv])
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

function hitBeads(commands: DrawCommand[]) {
  return commands.filter((command) => (
    command.kind === 'circle'
    && command.smooth
    && command.radius === 2.2
    && command.shade === 13
  ))
}

function emittedPulses(commands: DrawCommand[]) {
  return commands.filter((command) => (
    command.kind === 'circle'
    && command.smooth
    && command.radius === 2.2
    && command.shade !== 13
  ))
}

describe('Euclidean Rhythm Distribution display', () => {
  it('rests as Euclidean beads on a curved eight-socket rail', async () => {
    const { display, lua, runtime } = await createDistributionHarness()

    try {
      advance(runtime.step, 1000)
      const commands = drawFrame(display, runtime.draw)

      expect(frameText(commands)).toEqual(expect.arrayContaining([
        'E(3,8)',
        'EUCLID',
        '-/8',
      ]))
      expect(commands.filter((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.radius === 1.1
        && command.shade === 4
      ))).toHaveLength(8)
      expect(hitBeads(commands)).toHaveLength(3)
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'line',
          x1: 124,
          y1: 13,
          x2: 124,
          y2: 19,
          shade: 10,
        }),
        expect.objectContaining({
          kind: 'line',
          x1: 132,
          y1: 13,
          x2: 132,
          y2: 19,
          shade: 10,
        }),
      ]))
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('slides beads from Euclidean spacing into a front cluster', async () => {
    const { display, lua, runtime } = await createDistributionHarness()

    try {
      advance(runtime.step, 1)
      advance(runtime.step, 1, -5)
      runtime.trigger?.(2)

      advance(runtime.step, 80, -5)
      const middleCommands = drawFrame(display, runtime.draw)
      const middleBeads = hitBeads(middleCommands)

      advance(runtime.step, 180, -5)
      const finalCommands = drawFrame(display, runtime.draw)
      const finalBeads = hitBeads(finalCommands)

      expect(middleBeads).toHaveLength(3)
      expect(finalBeads).toHaveLength(3)
      if (
        middleBeads[2]?.kind === 'circle'
        && finalBeads[2]?.kind === 'circle'
      ) {
        expect(finalBeads[2].x).toBeLessThan(middleBeads[2].x)
      }
      expect(frameText(finalCommands)).toEqual(expect.arrayContaining([
        'E(3,8)',
        'FRONT',
        '-/8',
      ]))
      expectFrameInsideDisplay(middleCommands)
      expectFrameInsideDisplay(finalCommands)
    } finally {
      lua.global.close()
    }
  })

  it('pops a hit upward and drops a rest toward the inverted output', async () => {
    const { display, lua, runtime } = await createDistributionHarness()

    try {
      advance(runtime.step, 1)
      const hitOutput = callbackOutputEntries(runtime.trigger?.(1))
      expect(hitOutput).toEqual([[1, 5], [2, 0]])
      advance(runtime.step, 40)
      const hitCommands = drawFrame(display, runtime.draw)
      const hitPulse = emittedPulses(hitCommands)[0]

      expect(frameText(hitCommands)).toContain('1/8')
      expect(hitPulse).toBeDefined()
      if (hitPulse?.kind === 'circle') {
        expect(hitPulse.y).toBeLessThan(33)
      }

      const restOutput = callbackOutputEntries(runtime.trigger?.(1))
      expect(restOutput).toEqual([[1, 0], [2, 5]])
      advance(runtime.step, 40)
      const restCommands = drawFrame(display, runtime.draw)
      const restPulse = emittedPulses(restCommands)[0]

      expect(frameText(restCommands)).toContain('2/8')
      expect(restPulse).toBeDefined()
      if (restPulse?.kind === 'circle') {
        expect(restPulse.y).toBeGreaterThan(30)
      }
      expectFrameInsideDisplay(hitCommands)
      expectFrameInsideDisplay(restCommands)
    } finally {
      lua.global.close()
    }
  })

  it('makes Trigger Length visibly extend the emitted pulse', async () => {
    const short = await createDistributionHarness([8, 3, 50, 0, 1])
    const long = await createDistributionHarness([8, 3, 50, 0, 50])

    try {
      advance(short.runtime.step, 1)
      short.runtime.trigger?.(1)
      advance(short.runtime.step, 100)
      const shortCommands = drawFrame(short.display, short.runtime.draw)

      advance(long.runtime.step, 1)
      long.runtime.trigger?.(1)
      advance(long.runtime.step, 100)
      const longCommands = drawFrame(long.display, long.runtime.draw)

      expect(emittedPulses(shortCommands)).toHaveLength(0)
      expect(emittedPulses(longCommands)).toHaveLength(1)
      expectFrameInsideDisplay(shortCommands)
      expectFrameInsideDisplay(longCommands)
    } finally {
      short.lua.global.close()
      long.lua.global.close()
    }
  })

  it('shows Rotation phase and stays bounded with 32 back-clustered hits', async () => {
    const { display, lua, runtime } = await createDistributionHarness(
      [32, 32, 100, 31, 50],
    )

    try {
      advance(runtime.step, 1000)
      runtime.trigger?.(2)
      advance(runtime.step, 200)
      const commands = drawFrame(display, runtime.draw)

      expect(frameText(commands)).toEqual(expect.arrayContaining([
        'E(32,32)',
        'BACK',
        '-/32',
      ]))
      expect(hitBeads(commands)).toHaveLength(32)
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'circle',
          x: 234,
          y: 38,
          radius: 1.5,
          shade: 7,
          smooth: true,
        }),
      ]))
      expect(commands.length).toBeLessThan(130)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })
})
