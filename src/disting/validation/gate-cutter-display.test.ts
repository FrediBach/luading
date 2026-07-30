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
  join(process.cwd(), 'lua-scripts/fredi-bach/Gate Cutter Configurable.lua'),
  'utf8',
)

const defaultParameters = [500, 100, 4]

async function createGateCutterHarness(parameters = defaultParameters) {
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
) {
  let output: unknown
  for (let i = 0; i < milliseconds; i += 1) {
    output = step?.(0.001, [0])
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

function upperBlade(commands: DrawCommand[]) {
  return commands.find((command) => (
    command.kind === 'line'
    && command.smooth
    && command.x1 === 142
    && command.y1 === 31
    && command.x2 === 160
    && command.y2 < 31
  ))
}

function plannedNotches(commands: DrawCommand[]) {
  return commands.filter((command) => (
    command.kind === 'line'
    && !command.smooth
    && command.y1 === 8
    && command.y2 === 12
    && command.shade === 3
  ))
}

function completedNotches(commands: DrawCommand[]) {
  return commands.filter((command) => (
    command.kind === 'box'
    && command.fill
    && command.y1 === 7
    && command.y2 === 12
  ))
}

function liveOutputRibbon(commands: DrawCommand[]) {
  return commands.find((command) => (
    command.kind === 'box'
    && command.fill
    && command.x1 === 166
    && command.x2 === 250
    && command.y1 === 29
    && command.y2 === 33
    && command.shade >= 12
  ))
}

function seamXs(commands: DrawCommand[]) {
  return commands
    .filter((command) => (
      command.kind === 'line'
      && !command.smooth
      && command.y1 === 29
      && command.y2 === 33
      && command.shade === 5
    ))
    .map((command) => command.kind === 'line' ? command.x1 : 0)
}

function seamSpacing(commands: DrawCommand[]) {
  const positions = seamXs(commands).sort((left, right) => left - right)
  return positions.length >= 2 ? positions[1] - positions[0] : 0
}

function dimCutTail(commands: DrawCommand[]) {
  return commands.find((command) => (
    command.kind === 'box'
    && command.fill
    && command.x2 === 250
    && command.y1 === 29
    && command.y2 === 33
    && command.shade === 3
  ))
}

describe('Gate Cutter display', () => {
  it('rests with open scissors, no ribbon, and planned cut notches', async () => {
    const { display, lua, runtime } = await createGateCutterHarness()

    try {
      const commands = drawFrame(display, runtime.draw)

      expect(frameText(commands)).toEqual(expect.arrayContaining([
        'IN',
        'OUT',
        'cut 0/4',
        'idle',
      ]))
      expect(plannedNotches(commands)).toHaveLength(4)
      expect(completedNotches(commands)).toHaveLength(0)
      expect(upperBlade(commands)).toMatchObject({
        kind: 'line',
        x2: 160,
        y2: 21,
        shade: 10,
      })
      expect(liveOutputRibbon(commands)).toBeUndefined()
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('advances a solid high ribbon toward the first timed cut', async () => {
    const { display, lua, runtime } = await createGateCutterHarness()

    try {
      expect(callbackOutputEntries(runtime.gate?.(1, true))).toEqual([[1, 5]])
      const startCommands = drawFrame(display, runtime.draw)
      expect(frameText(startCommands)).toEqual(expect.arrayContaining([
        'cut 0/4',
        'wait 500ms',
      ]))
      expect(liveOutputRibbon(startCommands)).toBeDefined()
      const startSeams = seamXs(startCommands)

      advance(runtime.step, 250)
      const middleCommands = drawFrame(display, runtime.draw)
      expect(frameText(middleCommands)).toContain('wait 250ms')
      expect(seamXs(middleCommands)).not.toEqual(startSeams)
      expect(liveOutputRibbon(middleCommands)).toBeDefined()
      expectFrameInsideDisplay(startCommands)
      expectFrameInsideDisplay(middleCommands)
    } finally {
      lua.global.close()
    }
  })

  it('closes the blades, passes a dark configured gap, and reopens', async () => {
    const { display, lua, runtime } = await createGateCutterHarness()

    try {
      runtime.gate?.(1, true)
      expect(callbackOutputEntries(advance(runtime.step, 500))).toEqual([[1, 0]])

      const cutStartCommands = drawFrame(display, runtime.draw)
      expect(frameText(cutStartCommands)).toEqual(expect.arrayContaining([
        'cut 1/4',
        'gap 100ms',
      ]))
      expect(completedNotches(cutStartCommands)).toHaveLength(1)
      expect(liveOutputRibbon(cutStartCommands)).toBeUndefined()
      expect(upperBlade(cutStartCommands)).toMatchObject({ shade: 15 })

      advance(runtime.step, 20)
      const closedCommands = drawFrame(display, runtime.draw)
      const closedBlade = upperBlade(closedCommands)
      expect(closedBlade?.kind === 'line' ? closedBlade.y2 : undefined)
        .toBeGreaterThan(27)
      expect(frameText(closedCommands)).toContain('gap 80ms')
      expect(liveOutputRibbon(closedCommands)).toBeUndefined()

      expect(callbackOutputEntries(advance(runtime.step, 80))).toEqual([[1, 5]])
      advance(runtime.step, 45)
      const reopenedCommands = drawFrame(display, runtime.draw)
      const reopenedBlade = upperBlade(reopenedCommands)
      expect(reopenedBlade?.kind === 'line' ? reopenedBlade.y2 : undefined)
        .toBeLessThan(25)
      expect(frameText(reopenedCommands)).toEqual(expect.arrayContaining([
        'cut 1/4',
        'wait 455ms',
      ]))
      expect(liveOutputRibbon(reopenedCommands)).toBeDefined()
      expectFrameInsideDisplay(cutStartCommands)
      expectFrameInsideDisplay(closedCommands)
      expectFrameInsideDisplay(reopenedCommands)
    } finally {
      lua.global.close()
    }
  })

  it('settles into a continuous ribbon after the configured maximum cuts', async () => {
    const { display, lua, runtime } = await createGateCutterHarness([10, 5, 2])

    try {
      runtime.gate?.(1, true)
      expect(callbackOutputEntries(advance(runtime.step, 10))).toEqual([[1, 0]])
      expect(callbackOutputEntries(advance(runtime.step, 5))).toEqual([[1, 5]])
      expect(callbackOutputEntries(advance(runtime.step, 10))).toEqual([[1, 0]])
      expect(callbackOutputEntries(advance(runtime.step, 5))).toEqual([[1, 5]])
      expect(callbackOutputEntries(advance(runtime.step, 10))).toEqual([[1, 5]])

      const commands = drawFrame(display, runtime.draw)
      expect(frameText(commands)).toEqual(expect.arrayContaining([
        'cut 2/2',
        'done',
      ]))
      expect(completedNotches(commands)).toHaveLength(2)
      expect(liveOutputRibbon(commands)).toMatchObject({ shade: 12 })
      expect(callbackOutputEntries(advance(runtime.step, 50))).toEqual([])
      expectFrameInsideDisplay(commands)
    } finally {
      lua.global.close()
    }
  })

  it('maps wait time to seam spacing and cut length to spatial gap width', async () => {
    const longWait = await createGateCutterHarness([900, 100, 1])
    const shortWait = await createGateCutterHarness([100, 900, 1])
    const shortGap = await createGateCutterHarness([10, 10, 1])
    const longGap = await createGateCutterHarness([10, 1000, 1])

    try {
      longWait.runtime.gate?.(1, true)
      shortWait.runtime.gate?.(1, true)
      advance(longWait.runtime.step, 50)
      advance(shortWait.runtime.step, 50)
      const longWaitCommands = drawFrame(longWait.display, longWait.runtime.draw)
      const shortWaitCommands = drawFrame(shortWait.display, shortWait.runtime.draw)
      expect(seamSpacing(longWaitCommands))
        .toBeGreaterThan(seamSpacing(shortWaitCommands))

      shortGap.runtime.gate?.(1, true)
      longGap.runtime.gate?.(1, true)
      advance(shortGap.runtime.step, 15)
      advance(longGap.runtime.step, 510)
      const shortGapCommands = drawFrame(shortGap.display, shortGap.runtime.draw)
      const longGapCommands = drawFrame(longGap.display, longGap.runtime.draw)
      const shortTail = dimCutTail(shortGapCommands)
      const longTail = dimCutTail(longGapCommands)
      expect(shortTail).toBeDefined()
      expect(longTail).toBeDefined()
      if (shortTail?.kind === 'box' && longTail?.kind === 'box') {
        expect(longTail.x1).toBeGreaterThan(shortTail.x1)
      }
      expectFrameInsideDisplay(longWaitCommands)
      expectFrameInsideDisplay(shortWaitCommands)
      expectFrameInsideDisplay(shortGapCommands)
      expectFrameInsideDisplay(longGapCommands)
    } finally {
      longWait.lua.global.close()
      shortWait.lua.global.close()
      shortGap.lua.global.close()
      longGap.lua.global.close()
    }
  })

  it('lets a dim remembered tail exit on input fall and bounds 32 notches', async () => {
    const { display, lua, runtime } = await createGateCutterHarness([10, 2000, 32])

    try {
      runtime.gate?.(1, true)
      advance(runtime.step, 5)
      expect(callbackOutputEntries(runtime.gate?.(1, false))).toEqual([[1, 0]])
      const releasedCommands = drawFrame(display, runtime.draw)
      expect(plannedNotches(releasedCommands)).toHaveLength(32)
      expect(releasedCommands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'box',
          x1: 166,
          x2: 250,
          y1: 29,
          y2: 33,
          shade: 7,
          fill: true,
        }),
      ]))
      expect(frameText(releasedCommands)).toEqual(expect.arrayContaining([
        'cut 0/32',
        'idle',
      ]))

      advance(runtime.step, 200)
      const settledCommands = drawFrame(display, runtime.draw)
      expect(settledCommands.some((command) => (
        command.kind === 'box'
        && command.fill
        && command.x2 === 250
        && command.y1 === 29
        && command.y2 === 33
      ))).toBe(false)
      expectFrameInsideDisplay(releasedCommands)
      expectFrameInsideDisplay(settledCommands)
    } finally {
      lua.global.close()
    }
  })
})
