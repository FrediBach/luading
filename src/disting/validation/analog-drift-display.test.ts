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
  join(process.cwd(), 'lua-scripts/fredi-bach/Analog Drift CV Script.lua'),
  'utf8',
)

async function createAnalogDriftHarness(parameters = [50, 0, 30]) {
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

describe('Analog Drift display', () => {
  it('rests the particle on the moving target when Amount is zero', async () => {
    const { display, lua, runtime } = await createAnalogDriftHarness([0, 0, 30])

    try {
      let output: unknown
      for (let i = 0; i < 250; i += 1) {
        output = runtime.step?.(0.001, [2.5])
      }

      const zeroAmountEntries = callbackOutputEntries(output)
      expect(zeroAmountEntries?.find(([index]) => index === 1)?.[1]).toBe(2.5)
      expect(Number(zeroAmountEntries?.find(([index]) => index === 2)?.[1]))
        .toBeCloseTo(0, 10)

      const commands = drawFrame(display, runtime.draw)
      const target = commands.find((command) => (
        command.kind === 'circle'
        && !command.smooth
        && command.radius === 8
        && command.shade === 3
      ))
      const particle = commands.find((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.shade === 15
      ))

      expect(target).toBeDefined()
      expect(particle).toBeDefined()
      if (target?.kind === 'circle' && particle?.kind === 'circle') {
        expect(particle.x).toBeCloseTo(target.x, 0)
        expect(particle.y).toBeCloseTo(target.y, 0)
      }
      expect(frameText(commands)).toEqual(expect.arrayContaining([
        'IN +2.50V',
        'D +0.0mV',
        'OUT +2.50V',
      ]))
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('draws a bounded fading trail and preserves the CV-plus-drift relationship', async () => {
    const { display, lua, runtime } = await createAnalogDriftHarness([100, 100, 100])

    try {
      let output: unknown
      for (let i = 0; i < 1500; i += 1) {
        output = runtime.step?.(0.001, [1.25])
      }

      const entries = callbackOutputEntries(output)
      expect(entries).toBeDefined()
      expect(entries).not.toBeNull()
      if (entries) {
        const outputCv = Number(entries.find(([index]) => index === 1)?.[1])
        const driftCv = Number(entries.find(([index]) => index === 2)?.[1])
        expect(outputCv - 1.25).toBeCloseTo(driftCv, 10)
      }

      const commands = drawFrame(display, runtime.draw)
      const smoothCircles = commands.filter((command) => (
        command.kind === 'circle' && command.smooth
      ))
      const trailLines = commands.filter((command) => (
        command.kind === 'line'
        && command.smooth
        && command.shade >= 2
        && command.shade <= 9
      ))

      // 18 trail points plus the particle's halo and core.
      expect(smoothCircles).toHaveLength(20)
      expect(trailLines.length).toBeGreaterThanOrEqual(17)
      expect(trailLines.length).toBeLessThanOrEqual(18)
      expect(frameText(commands).some((text) => /^D [+-]\d+\.\dmV$/.test(text)))
        .toBe(true)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('keeps the ruler, target, and particle inside the framebuffer at parameter extremes', async () => {
    const { display, lua, runtime } = await createAnalogDriftHarness([100, -100, 0])

    try {
      for (let i = 0; i < 750; i += 1) {
        runtime.step?.(0.001, [-5])
      }

      const commands = drawFrame(display, runtime.draw)
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'box',
          x1: 60,
          y1: 13,
          x2: 250,
          y2: 53,
          shade: 2,
          fill: false,
        }),
        expect.objectContaining({
          kind: 'line',
          x1: 34,
          y1: 15,
          x2: 34,
          y2: 51,
          shade: 5,
        }),
      ]))
      expect(frameText(commands)).toEqual(expect.arrayContaining(['IN -5.00V']))
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })
})
