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
  join(process.cwd(), 'lua-scripts/fredi-bach/Deja Vu Memory Script.lua'),
  'utf8',
)

const defaultParameters = [8, 25, 0, 0]

async function createDejaVuHarness(parameters = defaultParameters) {
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
  pitch = 0,
  memoryCv = 0,
  probabilityCv = 0,
) {
  let output: unknown
  for (let i = 0; i < milliseconds; i += 1) {
    output = step?.(0.001, [pitch, 0, memoryCv, probabilityCv])
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

describe('Deja Vu Memory display', () => {
  it('rests as an empty two-reel tape loop with compact chute telemetry', async () => {
    const { display, lua, runtime } = await createDejaVuHarness()

    try {
      advance(runtime.step, 1000)
      const commands = drawFrame(display, runtime.draw)

      expect(frameText(commands)).toEqual(expect.arrayContaining([
        'IN C4',
        '0/8',
        'C4 OUT',
      ]))
      expect(commands.filter((command) => (
        command.kind === 'line'
        && command.smooth
        && command.shade === 3
      ))).toHaveLength(24)
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'circle',
          x: 101,
          y: 30,
          radius: 8,
          shade: 5,
        }),
        expect.objectContaining({
          kind: 'circle',
          x: 155,
          y: 30,
          radius: 8,
          shade: 5,
        }),
        expect.objectContaining({
          kind: 'circle',
          smooth: true,
          x: 190,
          y: 30,
          radius: 2.75,
        }),
      ]))
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('records a new note, advances the tape, and lights the gate chute', async () => {
    const { display, lua, runtime } = await createDejaVuHarness([8, 0, 0, 0])

    try {
      advance(runtime.step, 1, 1)
      const output = callbackOutputEntries(runtime.gate?.(2, true))
      expect(output?.find(([index]) => index === 1)?.[1]).toBe(1)
      expect(output?.find(([index]) => index === 2)?.[1]).toBe(5)

      advance(runtime.step, 50, 1)
      const earlyCommands = drawFrame(display, runtime.draw)
      const travellingBeads = earlyCommands.filter((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.radius === 2.2
      ))

      expect(frameText(earlyCommands)).toEqual(expect.arrayContaining([
        'IN C5',
        '1/8',
        'C5 OUT',
      ]))
      expect(frameText(earlyCommands)).not.toContain('DEJA')
      expect(travellingBeads.some((command) => (
        command.kind === 'circle'
        && command.x > 22
        && command.x < 66
      ))).toBe(true)
      expect(earlyCommands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'line',
          x1: 190,
          y1: 30,
          x2: 252,
          y2: 30,
          shade: 15,
          smooth: true,
        }),
      ]))

      runtime.gate?.(2, false)
      const releasedCommands = drawFrame(display, runtime.draw)
      expect(releasedCommands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'line',
          x1: 190,
          y1: 30,
          x2: 252,
          y2: 30,
          shade: 4,
          smooth: true,
        }),
      ]))
      expectFrameInsideDisplay(earlyCommands)
      expectFrameInsideDisplay(releasedCommands)
    } finally {
      lua.global.close()
    }
  })

  it('pulls a recalled bead to the read head and flashes DEJA', async () => {
    const { display, lua, runtime } = await createDejaVuHarness([8, 100, 0, 0])

    try {
      advance(runtime.step, 1, 0.5)
      runtime.gate?.(2, true)
      runtime.gate?.(2, false)

      advance(runtime.step, 500, 1.25)
      const output = callbackOutputEntries(runtime.gate?.(2, true))
      expect(output?.find(([index]) => index === 1)?.[1]).toBe(0.5)

      advance(runtime.step, 50, 1.25)
      const commands = drawFrame(display, runtime.draw)

      expect(frameText(commands)).toEqual(expect.arrayContaining([
        'DEJA',
        'IN D#5',
        '2/8',
        'F#4 OUT',
      ]))
      expect(commands.some((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.radius === 2.2
        && command.x > 70
        && command.x < 190
      ))).toBe(true)
      expect(commands.some((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.radius === 1.5
        && command.shade === 15
      ))).toBe(true)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('smoothly expands to 32 slots and expresses CV probability at the read head', async () => {
    const { display, lua, runtime } = await createDejaVuHarness([8, 0, 100, 100])

    try {
      advance(runtime.step, 1000, -2, 2.4, 5)
      const commands = drawFrame(display, runtime.draw)

      expect(frameText(commands)).toEqual(expect.arrayContaining([
        'IN C2',
        '0/32',
        'C4 OUT',
      ]))
      expect(commands.filter((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.radius === 0.7
        && command.shade === 3
      ))).toHaveLength(32)
      const readHead = commands.find((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.x === 190
        && command.y === 30
        && command.shade === 15
      ))
      expect(readHead).toBeDefined()
      if (readHead?.kind === 'circle') {
        expect(readHead.radius).toBeGreaterThan(4.99)
      }
      expect(commands.length).toBeLessThan(80)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })
})
