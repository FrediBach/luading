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
  join(process.cwd(), 'lua-scripts/fredi-bach/Feedback Tamer Script.lua'),
  'utf8',
)

const defaultParameters = [-6, 1, 200, 4, 5, 0, 0]

async function createFeedbackHarness(parameters = defaultParameters) {
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
  audioInput = 0,
) {
  let output: unknown
  for (let i = 0; i < milliseconds; i += 1) {
    output = step?.(0.001, [audioInput])
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

function upperJaw(commands: DrawCommand[]) {
  return commands.find((command) => (
    command.kind === 'line'
    && command.smooth
    && command.x1 === 137
    && command.y1 === 9
    && command.x2 === 152
  ))
}

function thresholdBracket(commands: DrawCommand[]) {
  return commands.find((command) => (
    command.kind === 'line'
    && command.smooth
    && command.x1 === 132
    && command.x2 === 132
    && command.shade === 7
  ))
}

function latestTraceY(commands: DrawCommand[], endpointX: number) {
  const line = commands.find((command) => (
    command.kind === 'line'
    && command.smooth
    && command.x2 === endpointX
  ))
  return line?.kind === 'line' ? line.y2 : undefined
}

function peakSparks(commands: DrawCommand[]) {
  return commands.filter((command) => (
    command.kind === 'circle'
    && command.smooth
    && command.x < 130
    && command.radius > 1.5
  ))
}

describe('Feedback Tamer display', () => {
  it('rests as an open pair of jaws between flat input and output traces', async () => {
    const { display, lua, runtime } = await createFeedbackHarness()

    try {
      const output = advance(runtime.step, 1000)
      const entries = callbackOutputEntries(output)
      expect(entries).toEqual([[1, 5], [2, 0]])

      const commands = drawFrame(display, runtime.draw)
      expect(frameText(commands)).toEqual(expect.arrayContaining([
        'IN',
        'OUT',
        'PASS',
        'TH -6dB',
        'GR 0%',
        'CV +5.00V',
      ]))
      expect(upperJaw(commands)).toMatchObject({
        kind: 'line',
        x2: 152,
        y2: 17,
        shade: 8,
      })
      expect(commands.filter((command) => (
        command.kind === 'line'
        && command.smooth
        && command.x1 >= 5
        && command.x2 <= 128
      )).length).toBeGreaterThanOrEqual(29)
      expect(commands.filter((command) => (
        command.kind === 'line'
        && command.smooth
        && command.x1 >= 170
        && command.x2 <= 249
      ))).toHaveLength(29)
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('closes the jaws and visibly shrinks the authoritative reduced output', async () => {
    const { display, lua, runtime } = await createFeedbackHarness()

    try {
      const output = advance(runtime.step, 1000, 5)
      const entries = callbackOutputEntries(output)
      const cvOut = Number(entries?.find(([index]) => index === 1)?.[1])
      const audioOut = Number(entries?.find(([index]) => index === 2)?.[1])

      expect(cvOut).toBeCloseTo(2.978, 3)
      expect(audioOut).toBeCloseTo(2.978, 3)

      const commands = drawFrame(display, runtime.draw)
      const inputY = latestTraceY(commands, 128)
      const outputY = latestTraceY(commands, 249)
      const tamedJaw = upperJaw(commands)

      expect(frameText(commands)).toEqual(expect.arrayContaining([
        'TAME',
        'GR 40%',
        'CV +2.98V',
      ]))
      expect(tamedJaw?.kind === 'line' ? tamedJaw.y2 : undefined)
        .toBeGreaterThan(17)
      expect(inputY).toBeCloseTo(17, 5)
      expect(outputY).toBeGreaterThan(17)
      expect(outputY).toBeLessThan(31)
      expect(peakSparks(commands)).toHaveLength(1)

      advance(runtime.step, 50, 0)
      const releasingCommands = drawFrame(display, runtime.draw)
      const releasingJaw = upperJaw(releasingCommands)
      if (tamedJaw?.kind === 'line' && releasingJaw?.kind === 'line') {
        expect(releasingJaw.y2).toBeLessThan(tamedJaw.y2)
        expect(releasingJaw.y2).toBeGreaterThan(17)
      }
      expectFrameInsideDisplay(commands)
      expectFrameInsideDisplay(releasingCommands)
    } finally {
      lua.global.close()
    }
  })

  it('uses threshold position and ratio leverage to explain limiting', async () => {
    const lowThreshold = await createFeedbackHarness([-40, 1, 200, 1, 5, 0, 0])
    const highThreshold = await createFeedbackHarness([0, 1, 200, 1, 5, 0, 0])
    const limiter = await createFeedbackHarness([-20, 1, 200, 20, 5, 0, 0])

    try {
      advance(lowThreshold.runtime.step, 100)
      const lowThresholdCommands = drawFrame(
        lowThreshold.display,
        lowThreshold.runtime.draw,
      )
      advance(highThreshold.runtime.step, 100)
      const highThresholdCommands = drawFrame(
        highThreshold.display,
        highThreshold.runtime.draw,
      )

      const lowBracket = thresholdBracket(lowThresholdCommands)
      const highBracket = thresholdBracket(highThresholdCommands)
      expect(lowBracket?.kind === 'line' ? lowBracket.y1 : undefined)
        .toBeGreaterThan(30)
      expect(highBracket?.kind === 'line' ? highBracket.y1 : undefined)
        .toBeCloseTo(17, 5)

      const output = advance(limiter.runtime.step, 1000, 5)
      const entries = callbackOutputEntries(output)
      const limiterCommands = drawFrame(limiter.display, limiter.runtime.draw)
      const limiterJaw = upperJaw(limiterCommands)
      expect(Number(entries?.find(([index]) => index === 1)?.[1]))
        .toBeCloseTo(0.561, 3)
      expect(frameText(limiterCommands)).toEqual(expect.arrayContaining([
        'LIMIT',
        'GR 89%',
        'TH -20dB',
      ]))
      expect(limiterJaw?.kind === 'line' ? limiterJaw.y2 : undefined)
        .toBeGreaterThan(25)
      expectFrameInsideDisplay(lowThresholdCommands)
      expectFrameInsideDisplay(highThresholdCommands)
      expectFrameInsideDisplay(limiterCommands)
    } finally {
      lowThreshold.lua.global.close()
      highThreshold.lua.global.close()
      limiter.lua.global.close()
    }
  })

  it('shows the side-chain HPF removing sustained low-frequency motion', async () => {
    const unfiltered = await createFeedbackHarness([-6, 1, 10, 4, 5, 0, 0])
    const highPassed = await createFeedbackHarness([-6, 1, 10, 4, 5, 0, 500])

    try {
      advance(unfiltered.runtime.step, 1000, 3)
      advance(highPassed.runtime.step, 1000, 3)
      const unfilteredCommands = drawFrame(
        unfiltered.display,
        unfiltered.runtime.draw,
      )
      const highPassedCommands = drawFrame(
        highPassed.display,
        highPassed.runtime.draw,
      )
      const unfilteredY = latestTraceY(unfilteredCommands, 128)
      const highPassedY = latestTraceY(highPassedCommands, 128)

      expect(unfilteredY).toBeCloseTo(22.6, 5)
      expect(highPassedY).toBeCloseTo(31, 4)
      expectFrameInsideDisplay(unfilteredCommands)
      expectFrameInsideDisplay(highPassedCommands)
    } finally {
      unfiltered.lua.global.close()
      highPassed.lua.global.close()
    }
  })

  it('fades the held peak spark by elapsed time', async () => {
    const { display, lua, runtime } = await createFeedbackHarness(
      [-6, 1, 10, 4, 5, 0, 0],
    )

    try {
      advance(runtime.step, 100, 5)
      const peakCommands = drawFrame(display, runtime.draw)
      expect(peakSparks(peakCommands)).toHaveLength(1)

      advance(runtime.step, 1100, 0)
      const fadedCommands = drawFrame(display, runtime.draw)
      expect(peakSparks(fadedCommands)).toHaveLength(0)
      expectFrameInsideDisplay(peakCommands)
      expectFrameInsideDisplay(fadedCommands)
    } finally {
      lua.global.close()
    }
  })
})
