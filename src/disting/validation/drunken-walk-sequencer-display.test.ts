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
  join(process.cwd(), 'lua-scripts/fredi-bach/Drunken Walk Sequencer.lua'),
  'utf8',
)

const defaultParameters = [8, 75, 1, 2]

async function createDrunkenWalkHarness(parameters = defaultParameters) {
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
  signal = 0,
  probabilityCv = 0,
) {
  let output: unknown
  for (let i = 0; i < milliseconds; i += 1) {
    output = step?.(0.001, [signal, 0, probabilityCv, 0])
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

function marble(commands: DrawCommand[]) {
  return commands.find((command) => (
    command.kind === 'circle'
    && command.smooth
    && command.radius === 3
    && command.shade === 15
  ))
}

describe('Drunken Walk Sequencer display', () => {
  it('rests as eight empty cups on a routed rail with Step CV telemetry', async () => {
    const { display, lua, runtime } = await createDrunkenWalkHarness()

    try {
      advance(runtime.step, 1000)
      const commands = drawFrame(display, runtime.draw)
      const texts = frameText(commands)

      expect(texts).toEqual(expect.arrayContaining([
        '1', '2', '3', '4', '5', '6', '7', '8',
        'CV',
        'S&H',
        'WRAP',
        '75% FWD',
      ]))
      expect(commands.filter((command) => (
        command.kind === 'line'
        && command.smooth
        && command.y2 === 41
      ))).toHaveLength(16)
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'line',
          x1: 34,
          y1: 24,
          x2: 34,
          y2: 48,
          shade: 11,
          smooth: true,
        }),
        expect.objectContaining({
          kind: 'circle',
          x: 158,
          y: 53,
          radius: 1.8,
          shade: 15,
          smooth: true,
        }),
      ]))
      const restingMarble = marble(commands)
      expect(restingMarble).toBeDefined()
      if (restingMarble?.kind === 'circle') {
        expect(restingMarble.x).toBe(34)
        expect(restingMarble.y).toBe(27)
      }
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('retains bipolar sampled cup fills and serialized routing state in S&H mode', async () => {
    const { display, lua, runtime } = await createDrunkenWalkHarness([4, 100, 1, 2])

    try {
      let output = callbackOutputEntries(advance(runtime.step, 1, 2))
      expect(output?.find(([index]) => index === 1)?.[1]).toBe(2)

      runtime.trigger?.(2)
      output = callbackOutputEntries(advance(runtime.step, 1, -5))
      expect(output?.find(([index]) => index === 1)?.[1]).toBe(2)
      expect(output?.find(([index]) => index === 2)?.[1]).toBe(-5)

      const triggerOutput = callbackOutputEntries(runtime.trigger?.(2))
      expect(triggerOutput?.find(([index]) => index === 1)?.[1]).toBe(2)
      expect(triggerOutput?.find(([index]) => index === 2)?.[1]).toBe(-5)
      expect(triggerOutput?.find(([index]) => index === 3)?.[1]).toBe(-5)

      advance(runtime.step, 300, 1)
      const commands = drawFrame(display, runtime.draw)
      const fills = commands.filter((command) => (
        command.kind === 'box'
        && command.fill
      ))

      const texts = frameText(commands)
      expect(texts).toEqual(expect.arrayContaining([
        'S&H',
        'WRAP',
      ]))
      expect(texts.some((text) => /^\d+% FWD$/.test(text))).toBe(true)
      expect(fills.some((command) => (
        command.kind === 'box'
        && command.x1 < 40
        && command.y1 < 34
        && command.y2 === 34
      ))).toBe(true)
      expect(fills.some((command) => (
        command.kind === 'box'
        && command.x1 > 80
        && command.x1 < 110
        && command.y1 === 34
        && command.y2 > 34
      ))).toBe(true)

      const state = runtime.serialise?.() as Record<string, unknown>
      expect(state).toMatchObject({
        currentStep: 3,
        heldValues: [2, -5, 1, 0, 0, 0, 0, 0],
        lastDirection: 1,
      })
      expect(state).not.toHaveProperty('display_values')
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('flashes only the active routed cup in Gate mode', async () => {
    const { display, lua, runtime } = await createDrunkenWalkHarness([4, 100, 1, 1])

    try {
      advance(runtime.step, 1, 3)
      const output = callbackOutputEntries(runtime.trigger?.(2))
      expect(output?.find(([index]) => index === 1)?.[1]).toBe(0)
      expect(output?.find(([index]) => index === 2)?.[1]).toBe(3)
      expect(output?.find(([index]) => index === 3)?.[1]).toBe(0)

      advance(runtime.step, 40, 3)
      const commands = drawFrame(display, runtime.draw)

      expect(frameText(commands)).toEqual(expect.arrayContaining([
        'GATE',
        'WRAP',
      ]))
      expect(commands.filter((command) => (
        command.kind === 'box'
        && command.fill
      ))).toHaveLength(0)
      expect(commands.some((command) => (
        command.kind === 'line'
        && command.smooth
        && command.x1 > 85
        && command.x1 < 100
        && command.shade >= 12
      ))).toBe(true)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('rolls through opposite portals when Wrap crosses the left edge', async () => {
    const { display, lua, runtime } = await createDrunkenWalkHarness([4, 0, 1, 2])

    try {
      advance(runtime.step, 1, 2)
      const output = callbackOutputEntries(runtime.trigger?.(2))
      expect(output?.find(([index]) => index === 9)?.[1]).toBe(10)

      advance(runtime.step, 45, 2)
      const exitCommands = drawFrame(display, runtime.draw)
      const exitMarble = marble(exitCommands)
      expect(exitMarble).toBeDefined()
      if (exitMarble?.kind === 'circle') {
        expect(exitMarble.x).toBeLessThan(34)
      }
      expect(exitCommands.filter((command) => (
        command.kind === 'circle'
        && !command.smooth
        && command.radius === 3
      ))).toEqual(expect.arrayContaining([
        expect.objectContaining({ x: 14, y: 27 }),
        expect.objectContaining({ x: 242, y: 27 }),
      ]))

      advance(runtime.step, 135, 2)
      const entryCommands = drawFrame(display, runtime.draw)
      const entryMarble = marble(entryCommands)
      expect(entryMarble).toBeDefined()
      if (entryMarble?.kind === 'circle') {
        expect(entryMarble.x).toBeGreaterThan(222)
      }

      runtime.setParameter?.(1, 2)
      const reducedCommands = drawFrame(display, runtime.draw)
      expectFrameInsideDisplay(exitCommands)
      expectFrameInsideDisplay(entryCommands)
      expectFrameInsideDisplay(reducedCommands)
    } finally {
      lua.global.close()
    }
  })

  it('ricochets from a Bounce wall and resets to the first cup', async () => {
    const { display, lua, runtime } = await createDrunkenWalkHarness([4, 0, 2, 2])

    try {
      advance(runtime.step, 1, 4)
      const output = callbackOutputEntries(runtime.trigger?.(2))
      expect(output?.find(([index]) => index === 2)?.[1]).toBe(4)
      expect(output?.find(([index]) => index === 9)?.[1])
        .toBeCloseTo(10 / 3)

      advance(runtime.step, 45, 4)
      const commands = drawFrame(display, runtime.draw)
      const movingMarble = marble(commands)

      expect(frameText(commands)).toContain('BOUNCE')
      expect(commands.some((command) => (
        command.kind === 'line'
        && command.x1 === 20
        && command.x2 === 20
        && command.shade >= 6
      ))).toBe(true)
      expect(movingMarble).toBeDefined()
      if (movingMarble?.kind === 'circle') {
        expect(movingMarble.x).toBeLessThan(34)
      }

      runtime.trigger?.(4)
      const resetCommands = drawFrame(display, runtime.draw)
      const resetMarble = marble(resetCommands)
      expect(resetMarble).toBeDefined()
      if (resetMarble?.kind === 'circle') {
        expect(resetMarble.x).toBe(34)
      }
      expect(resetCommands.some((command) => (
        command.kind === 'line'
        && command.x1 === 20
        && command.x2 === 20
      ))).toBe(false)
      expectFrameInsideDisplay(commands)
      expectFrameInsideDisplay(resetCommands)
    } finally {
      lua.global.close()
    }
  })

  it('smooths CV probability into the gravity arrow across the full range', async () => {
    const { display, lua, runtime } = await createDrunkenWalkHarness([8, 50, 1, 2])

    try {
      advance(runtime.step, 1000, 0, 5)
      const forwardCommands = drawFrame(display, runtime.draw)
      const forwardArrow = forwardCommands.find((command) => (
        command.kind === 'line'
        && command.smooth
        && command.x1 === 76
        && command.y1 === 56
      ))

      expect(frameText(forwardCommands)).toContain('100% FWD')
      expect(forwardArrow).toBeDefined()
      if (forwardArrow?.kind === 'line') {
        expect(forwardArrow.x2).toBeGreaterThan(92.9)
      }

      advance(runtime.step, 1000, 0, -5)
      const backwardCommands = drawFrame(display, runtime.draw)
      const backwardArrow = backwardCommands.find((command) => (
        command.kind === 'line'
        && command.smooth
        && command.x1 === 76
        && command.y1 === 56
      ))

      expect(frameText(backwardCommands)).toContain('0% FWD')
      expect(backwardArrow).toBeDefined()
      if (backwardArrow?.kind === 'line') {
        expect(backwardArrow.x2).toBeLessThan(59.1)
      }
      expectFrameInsideDisplay(forwardCommands)
      expectFrameInsideDisplay(backwardCommands)
    } finally {
      lua.global.close()
    }
  })
})
