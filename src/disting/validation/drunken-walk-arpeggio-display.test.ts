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
  join(process.cwd(), 'lua-scripts/fredi-bach/Drunken Walk Arpeggio.lua'),
  'utf8',
)

const defaultParameters = [4, 48, 0, 4, 7, 12, 11, 9, 5, 2, 0, 1]

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
  probabilityCv = 0,
) {
  let output: unknown
  for (let i = 0; i < milliseconds; i += 1) {
    output = step?.(0.001, [0, probabilityCv, 0])
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

function walkerHead(commands: DrawCommand[]) {
  return commands.find((command) => (
    command.kind === 'circle'
    && command.smooth
    && command.radius === 1.5
    && command.shade === 15
  ))
}

describe('Drunken Walk Arpeggio display', () => {
  it('rests on a pitch-shaped staircase with integrated note labels', async () => {
    const { display, lua, runtime } = await createDrunkenWalkHarness()

    try {
      advance(runtime.step, 1000)
      const commands = drawFrame(display, runtime.draw)

      expect(frameText(commands)).toEqual(expect.arrayContaining([
        'C',
        'E',
        'G',
        'C',
        'C3',
        'WRAP',
        '50% FWD',
      ]))
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'box',
          x1: 26,
          y1: 31,
          x2: 74,
          y2: 46,
          shade: 9,
          fill: true,
        }),
        expect.objectContaining({
          kind: 'box',
          x1: 182,
          y1: 26,
          x2: 230,
          y2: 46,
          shade: 2,
          fill: true,
        }),
        expect.objectContaining({
          kind: 'line',
          x1: 96,
          y1: 53,
          x2: 160,
          y2: 53,
          shade: 7,
          smooth: true,
        }),
        expect.objectContaining({
          kind: 'circle',
          x: 128,
          y: 51.5,
          radius: 2,
          shade: 12,
          smooth: true,
        }),
      ]))
      const head = walkerHead(commands)
      expect(head).toBeDefined()
      if (head?.kind === 'circle') {
        expect(head.x).toBe(50)
      }
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('leans and steps forward while preserving pitch and gate behavior', async () => {
    const parameters = [...defaultParameters]
    parameters[10] = 50
    const { display, lua, runtime } = await createDrunkenWalkHarness(parameters)

    try {
      advance(runtime.step, 1)
      const output = callbackOutputEntries(runtime.trigger?.(1))

      expect(output?.find(([index]) => index === 1)?.[1])
        .toBeCloseTo(-8 / 12)
      expect(output?.find(([index]) => index === 2)?.[1]).toBe(5)

      const gateOff = advance(runtime.step, 20)
      expect(callbackOutputEntries(gateOff)).toContainEqual([2, 0])
      advance(runtime.step, 60)
      const commands = drawFrame(display, runtime.draw)
      const head = walkerHead(commands)

      const texts = frameText(commands)
      expect(texts).toContain('E3')
      expect(texts.some((text) => /^\d+% FWD$/.test(text))).toBe(true)
      expect(head).toBeDefined()
      if (head?.kind === 'circle') {
        expect(head.x).toBeGreaterThan(50)
        expect(head.x).toBeLessThan(104)
      }
      expect(commands.some((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.radius > 2
        && command.radius < 7
        && command.x === 102
      ))).toBe(true)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('drops through opposite portals when Wrap crosses the left edge', async () => {
    const parameters = [...defaultParameters]
    parameters[10] = -50
    parameters[11] = 1
    const { display, lua, runtime } = await createDrunkenWalkHarness(parameters)

    try {
      advance(runtime.step, 1)
      runtime.trigger?.(1)
      advance(runtime.step, 45)
      const exitCommands = drawFrame(display, runtime.draw)
      const exitHead = walkerHead(exitCommands)

      const exitTexts = frameText(exitCommands)
      expect(exitTexts).toEqual(expect.arrayContaining([
        'C4',
        'WRAP',
      ]))
      expect(exitTexts.some((text) => /^\d+% FWD$/.test(text))).toBe(true)
      expect(exitHead).toBeDefined()
      if (exitHead?.kind === 'circle') {
        expect(exitHead.x).toBeLessThan(50)
      }
      expect(exitCommands.filter((command) => (
        command.kind === 'circle'
        && !command.smooth
        && command.radius === 3
      ))).toEqual(expect.arrayContaining([
        expect.objectContaining({ x: 14, y: 38 }),
        expect.objectContaining({ x: 242, y: 38 }),
      ]))

      advance(runtime.step, 135)
      const entryCommands = drawFrame(display, runtime.draw)
      const entryHead = walkerHead(entryCommands)
      expect(entryHead).toBeDefined()
      if (entryHead?.kind === 'circle') {
        expect(entryHead.x).toBeGreaterThan(206)
      }
      expectFrameInsideDisplay(exitCommands)
      expectFrameInsideDisplay(entryCommands)
    } finally {
      lua.global.close()
    }
  })

  it('rebounds from a Bounce wall and bumps in place in Sticky mode', async () => {
    const bounceParameters = [...defaultParameters]
    bounceParameters[10] = -50
    bounceParameters[11] = 2
    const bounce = await createDrunkenWalkHarness(bounceParameters)

    try {
      advance(bounce.runtime.step, 1)
      const bounceOutput = callbackOutputEntries(bounce.runtime.trigger?.(1))
      expect(bounceOutput?.find(([index]) => index === 1)?.[1])
        .toBeCloseTo(-8 / 12)
      advance(bounce.runtime.step, 45)
      const bounceCommands = drawFrame(bounce.display, bounce.runtime.draw)
      expect(frameText(bounceCommands)).toEqual(expect.arrayContaining([
        'E3',
        'BOUNCE',
      ]))
      expect(bounceCommands.some((command) => (
        command.kind === 'line'
        && command.x1 === 20
        && command.x2 === 20
        && command.shade >= 6
      ))).toBe(true)
      expectFrameInsideDisplay(bounceCommands)
    } finally {
      bounce.lua.global.close()
    }

    const stickyParameters = [...defaultParameters]
    stickyParameters[10] = -50
    stickyParameters[11] = 3
    const sticky = await createDrunkenWalkHarness(stickyParameters)

    try {
      advance(sticky.runtime.step, 1)
      const stickyOutput = callbackOutputEntries(sticky.runtime.trigger?.(1))
      expect(stickyOutput?.find(([index]) => index === 1)?.[1]).toBe(-1)
      advance(sticky.runtime.step, 45)
      const stickyCommands = drawFrame(sticky.display, sticky.runtime.draw)
      const head = walkerHead(stickyCommands)

      expect(frameText(stickyCommands)).toEqual(expect.arrayContaining([
        'C3',
        'STICKY',
      ]))
      expect(head).toBeDefined()
      if (head?.kind === 'circle') {
        expect(head.x).toBeLessThan(50)
      }

      sticky.runtime.trigger?.(3)
      const resetCommands = drawFrame(sticky.display, sticky.runtime.draw)
      const resetHead = walkerHead(resetCommands)
      expect(frameText(resetCommands)).toContain('C3')
      expect(resetCommands.some((command) => (
        command.kind === 'line'
        && command.x1 === 20
        && command.x2 === 20
      ))).toBe(false)
      expect(resetHead).toBeDefined()
      if (resetHead?.kind === 'circle') {
        expect(resetHead.x).toBe(50)
      }
      expectFrameInsideDisplay(stickyCommands)
      expectFrameInsideDisplay(resetCommands)
    } finally {
      sticky.lua.global.close()
    }
  })

  it('smooths CV probability across the full balance range at eight steps', async () => {
    const parameters = [
      8, 60, -24, -12, -7, 0, 7, 12, 19, 24, 0, 1,
    ]
    const { display, lua, runtime } = await createDrunkenWalkHarness(parameters)

    try {
      advance(runtime.step, 1000, 5)
      const forwardCommands = drawFrame(display, runtime.draw)
      const forwardWeight = forwardCommands.find((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.radius === 2
        && command.shade === 12
      ))

      expect(frameText(forwardCommands)).toEqual(expect.arrayContaining([
        'C2',
        '100% FWD',
      ]))
      expect(forwardWeight).toBeDefined()
      if (forwardWeight?.kind === 'circle') {
        expect(forwardWeight.x).toBeGreaterThan(159.9)
      }

      advance(runtime.step, 1000, -5)
      const backwardCommands = drawFrame(display, runtime.draw)
      const backwardWeight = backwardCommands.find((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.radius === 2
        && command.shade === 12
      ))

      expect(frameText(backwardCommands)).toContain('0% FWD')
      expect(backwardWeight).toBeDefined()
      if (backwardWeight?.kind === 'circle') {
        expect(backwardWeight.x).toBeLessThan(96.1)
      }

      runtime.trigger?.(1)
      runtime.setParameter?.(1, 2)
      const reducedCommands = drawFrame(display, runtime.draw)
      expectFrameInsideDisplay(forwardCommands)
      expectFrameInsideDisplay(backwardCommands)
      expectFrameInsideDisplay(reducedCommands)
    } finally {
      lua.global.close()
    }
  })
})
