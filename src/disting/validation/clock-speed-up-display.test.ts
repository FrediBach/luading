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
  join(process.cwd(), 'lua-scripts/fredi-bach/Clock Speed Up Script.lua'),
  'utf8',
)

const defaultParameters = [4, 4, 4]

async function createClockSpeedUpHarness(parameters = defaultParameters) {
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
) {
  let output: unknown
  for (let i = 0; i < milliseconds; i += 1) {
    output = step?.(0.001, [0, 0])
  }
  return output
}

function establish120Bpm(
  step: ((dt: number, inputs: number[]) => unknown) | undefined,
  trigger: ((input: number) => unknown) | undefined,
) {
  advance(step, 100)
  trigger?.(1)
  advance(step, 500)
  return trigger?.(1)
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

describe('Clock Speed Up display', () => {
  it('shows a waiting crosshair instead of inventing a tempo', async () => {
    const { display, lua, runtime } = await createClockSpeedUpHarness()

    try {
      advance(runtime.step, 100)
      const commands = drawFrame(display, runtime.draw)

      expect(frameText(commands)).toEqual(expect.arrayContaining([
        'PASS',
        'CLOCK?',
        'WAIT',
        'x1.00',
        '--BPM',
      ]))
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'line',
          x1: 114,
          y1: 34,
          x2: 142,
          y2: 34,
          shade: 6,
        }),
        expect.objectContaining({
          kind: 'line',
          x1: 128,
          y1: 20,
          x2: 128,
          y2: 48,
          shade: 6,
        }),
      ]))
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('shows measured pass-through tempo and a calm clock face', async () => {
    const { display, lua, runtime } = await createClockSpeedUpHarness()

    try {
      const output = establish120Bpm(runtime.step, runtime.trigger)
      expect(callbackOutputEntries(output)?.find(([index]) => index === 1)?.[1])
        .toBe(5)
      advance(runtime.step, 450)

      const commands = drawFrame(display, runtime.draw)
      const texts = frameText(commands)

      expect(texts).toEqual(expect.arrayContaining([
        'PASS',
        '120BPM',
        'x1.00',
      ]))
      expect(texts.filter((text) => text === '120BPM')).toHaveLength(2)
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'circle',
          smooth: false,
          x: 128,
          y: 34,
          radius: 9,
          shade: 5,
        }),
      ]))
      expect(commands.some((command) => (
        command.kind === 'circle' && command.smooth
      ))).toBe(false)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('launches bounded pulse rings through an easing-shaped tunnel', async () => {
    const { display, lua, runtime } = await createClockSpeedUpHarness()

    try {
      establish120Bpm(runtime.step, runtime.trigger)
      runtime.gate?.(2, true)
      advance(runtime.step, 2000)

      const commands = drawFrame(display, runtime.draw)
      const texts = frameText(commands)
      const guideRings = commands.filter((command) => (
        command.kind === 'circle'
        && !command.smooth
        && command.x === 128
        && command.y === 34
        && command.radius > 2
      ))
      const pulseRings = commands.filter((command) => (
        command.kind === 'circle'
        && command.smooth
        && command.x === 128
        && command.y === 34
      ))

      expect(texts).toContain('ACCEL')
      expect(texts.some((text) => /^x2\.\d{2}$/.test(text))).toBe(true)
      expect(texts).toContain('120BPM')
      expect(guideRings).toHaveLength(7)
      expect(guideRings.map((command) => (
        command.kind === 'circle' ? command.radius : 0
      ))).toEqual([4, 7, 12, 17, 20, 22, 24])
      expect(pulseRings.length).toBeGreaterThan(0)
      expect(pulseRings.length).toBeLessThanOrEqual(6)
      expect(commands.some((command) => (
        command.kind === 'line'
        && command.smooth
        && command.shade === 8
      ))).toBe(true)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('snaps the tunnel and multiplier back to pass-through on gate release', async () => {
    const { display, lua, runtime } = await createClockSpeedUpHarness()

    try {
      establish120Bpm(runtime.step, runtime.trigger)
      runtime.gate?.(2, true)
      advance(runtime.step, 2000)
      runtime.gate?.(2, false)

      const commands = drawFrame(display, runtime.draw)
      const texts = frameText(commands)

      expect(texts).toEqual(expect.arrayContaining([
        'PASS',
        '120BPM',
        'x1.00',
      ]))
      expect(texts.filter((text) => text === '120BPM')).toHaveLength(2)
      expect(commands.some((command) => (
        command.kind === 'circle' && command.smooth
      ))).toBe(false)
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'circle',
          smooth: false,
          radius: 9,
          shade: 5,
        }),
      ]))
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })
})
