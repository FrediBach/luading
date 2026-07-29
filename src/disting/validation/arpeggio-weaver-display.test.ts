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
  join(process.cwd(), 'lua-scripts/fredi-bach/Arpeggio Weaver LFO Routing.lua'),
  'utf8',
)

const defaultParameters = [
  48, 1, 50, 1, 0, 2, 50,
  1, 1, 2, 0,
  2, 2, 1, 0,
  3, 3, 2, 12,
  5, 4, 3, -12,
]

async function createArpeggioWeaverHarness(parameters = defaultParameters) {
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

describe('Arpeggio Weaver display', () => {
  it('draws four note threads, the shuttle, output ribbon, and scale telemetry', async () => {
    const { display, lua, runtime } = await createArpeggioWeaverHarness()

    try {
      for (let i = 0; i < 100; i += 1) {
        runtime.step?.(0.001, [0, 0, 0])
      }
      const commands = drawFrame(display, runtime.draw)
      const texts = frameText(commands)

      expect(texts).toEqual(expect.arrayContaining([
        '1',
        '2',
        '3',
        '4',
        '/1',
        '/2',
        '/3',
        '/4',
        'C3 Major',
        'C3',
        'LFO',
      ]))
      expect(texts.some((text) => /^ARP [1-4]$/.test(text))).toBe(true)
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'line',
          x1: 178,
          y1: 13,
          x2: 178,
          y2: 49,
          shade: 4,
          smooth: false,
        }),
        expect.objectContaining({
          kind: 'line',
          x1: 193,
          y1: 31,
          x2: 250,
          y2: 31,
          smooth: true,
        }),
      ]))
      expect(commands.filter((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.x >= 30
        && command.x <= 166
      )).length).toBeGreaterThanOrEqual(20)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('shows a deferred lane switch and carries the triggered note down the output ribbon', async () => {
    const externalWeaveParameters = [...defaultParameters]
    externalWeaveParameters[4] = 100
    const { display, lua, runtime } = await createArpeggioWeaverHarness(
      externalWeaveParameters,
    )

    try {
      runtime.step?.(0.001, [0, -5, 0])
      const triggerOutput = callbackOutputEntries(runtime.trigger?.(1))
      expect(triggerOutput?.find(([index]) => index === 2)?.[1]).toBe(5)
      expect(triggerOutput?.find(([index]) => index === 3)?.[1]).toBe(5)

      for (let i = 0; i < 50; i += 1) {
        runtime.step?.(0.001, [0, 5, 0])
      }
      const commands = drawFrame(display, runtime.draw)

      expect(frameText(commands)).toContain('A1>4')
      expect(commands.some((command) => (
        command.kind === 'box'
        && !command.fill
        && command.x1 === 172
        && command.x2 === 184
        && command.y1 === 42
        && command.y2 === 50
        && command.shade >= 7
      ))).toBe(true)
      expect(commands.some((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.radius === 2.2
        && command.x >= 178
      ))).toBe(true)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('clears pending and travelling display state on reset', async () => {
    const externalWeaveParameters = [...defaultParameters]
    externalWeaveParameters[4] = 100
    const { display, lua, runtime } = await createArpeggioWeaverHarness(
      externalWeaveParameters,
    )

    try {
      runtime.step?.(0.001, [0, -5, 0])
      runtime.trigger?.(1)
      runtime.step?.(0.001, [0, 5, 0])
      runtime.trigger?.(3)

      const commands = drawFrame(display, runtime.draw)
      const texts = frameText(commands)

      expect(texts).toContain('ARP 1')
      expect(texts.some((text) => /^A\d>\d$/.test(text))).toBe(false)
      expect(commands.some((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.radius === 2.2
        && command.x >= 178
      ))).toBe(false)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('bounds the note and LFO histories at the largest scale and octave settings', async () => {
    const extremeParameters = [...defaultParameters]
    extremeParameters[1] = 7
    extremeParameters[9] = 4
    extremeParameters[13] = 4
    extremeParameters[17] = 4
    extremeParameters[21] = 4
    extremeParameters[2] = 500
    const { display, lua, runtime } = await createArpeggioWeaverHarness(extremeParameters)

    try {
      for (let i = 0; i < 2000; i += 1) {
        runtime.step?.(0.001, [0, 0, 0])
      }
      const commands = drawFrame(display, runtime.draw)

      expect(frameText(commands)).toContain('C3 Chromatic')
      expect(commands.length).toBeLessThan(220)
      expect(commands.filter((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.x >= 30
        && command.x <= 166
      )).length).toBeLessThanOrEqual(68)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })
})
