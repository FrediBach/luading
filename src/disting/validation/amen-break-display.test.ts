/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
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
  join(process.cwd(), 'lua-scripts/fredi-bach/Amen Break Drum Triggers.lua'),
  'utf8',
)

async function createAmenHarness(parameters = [136, 1, 0, 2, 5]) {
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
  draw?.()
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

describe('Amen Break display', () => {
  it('draws the four-track record and settles to an external-clock idle frame', async () => {
    const { display, lua, runtime } = await createAmenHarness()

    try {
      for (let i = 0; i < 250; i += 1) {
        runtime.step?.(0.001, [0, 0, 0, 0, 0])
      }
      const commands = drawFrame(display, runtime.draw)
      const texts = frameText(commands)

      expect(texts).toEqual(expect.arrayContaining([
        'K',
        'S',
        'H',
        'O',
        '01/16',
        'EXT WAIT',
      ]))
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'circle',
          x: 64,
          y: 34,
          radius: 25,
          shade: 3,
        }),
        expect.objectContaining({
          kind: 'circle',
          x: 64,
          y: 34,
          radius: 8,
          shade: 2,
        }),
      ]))
      expect(commands.filter((command) => command.kind === 'line' && !command.smooth))
        .toHaveLength(16)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('latches fired kick and closed-hat pulses for the 30 fps display and clears them on reset', async () => {
    const { display, lua, runtime } = await createAmenHarness()

    try {
      runtime.step?.(0.001, [0, 0, 0, 0, 0])
      const activeCommands = drawFrame(display, runtime.draw)
      const activeSpeakerFills = activeCommands.filter((command) => (
        command.kind === 'box'
        && command.fill
        && command.x1 >= 145
        && command.x2 <= 242
      ))
      const travellingPulses = activeCommands.filter((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.shade >= 10
      ))

      expect(activeSpeakerFills.length).toBeGreaterThanOrEqual(2)
      expect(travellingPulses.length).toBeGreaterThanOrEqual(2)
      expectFrameInsideDisplay(activeCommands)

      runtime.trigger?.(2)
      const resetCommands = drawFrame(display, runtime.draw)
      const resetSpeakerFills = resetCommands.filter((command) => (
        command.kind === 'box'
        && command.fill
        && command.x1 >= 145
        && command.x2 <= 242
      ))

      expect(resetSpeakerFills).toEqual([])
      expect(frameText(resetCommands)).toEqual(expect.arrayContaining([
        '01/16',
        'EXT WAIT',
      ]))
      expectFrameInsideDisplay(resetCommands)
    } finally {
      lua.global.close()
    }
  })

  it('renders all 32 clock positions and reports measured external tempo', async () => {
    const { display, lua, runtime } = await createAmenHarness([136, 2, 0, 2, 5])

    try {
      runtime.step?.(0.001, [0, 0, 0, 0, 0])
      runtime.trigger?.(1)
      for (let i = 0; i < 125; i += 1) {
        runtime.step?.(0.001, [0, 0, 0, 0, 0])
      }
      runtime.trigger?.(1)

      const commands = drawFrame(display, runtime.draw)
      const texts = frameText(commands)

      expect(texts).toEqual(expect.arrayContaining(['03/32', '120BPM']))
      expect(commands.filter((command) => command.kind === 'line' && !command.smooth))
        .toHaveLength(32)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })
})
