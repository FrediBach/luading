/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { LuaProgramRuntime } from '../emulation/lua-contract'
import { describeProgram } from '../emulation/lua-contract'
import { loadLuaProgramRuntime } from '../emulation/lua-runtime'
import { LUA_SCRIPT_PARAMETER_OFFSET } from '../emulation/parameter-model'
import { createDistingLuaTestEngine } from '../testing/lua-test-environment'
import { validateProgramContract } from './contract-validator'

const scriptSource = readFileSync(
  join(process.cwd(), 'lua-scripts/fredi-bach/Strudel Mini Notation Player.lua'),
  'utf8',
)

const engines: Awaited<ReturnType<typeof createDistingLuaTestEngine>>[] = []

function sourceWithPattern(pattern: string) {
  const replacement = `local MINI_NOTATION = [==[\n${pattern}\n]==]`
  const source = scriptSource.replace(
    /local MINI_NOTATION = \[==\[[\s\S]*?\]==\]/,
    replacement,
  )
  expect(source).not.toBe(scriptSource)
  return source
}

async function loadPattern(pattern?: string) {
  const lua = await createDistingLuaTestEngine(100)
  engines.push(lua)
  const runtime = await loadLuaProgramRuntime(
    lua,
    pattern === undefined ? scriptSource : sourceWithPattern(pattern),
  )
  runtime.configure(1, LUA_SCRIPT_PARAMETER_OFFSET)
  const rawInit = runtime.init?.()
  const program = describeProgram(
    runtime.program,
    rawInit && typeof rawInit === 'object' ? rawInit : {},
  )
  runtime.setParameters([240, 10, 1])
  return { runtime, program, rawInit }
}

type PlayedEvent = {
  cycle: number
  gate: number
  midi: number
}

function play(runtime: LuaProgramRuntime, cycles: number, dt = 0.002) {
  const events: PlayedEvent[] = []
  const previousGates = [0, 0, 0, 0]
  // The query interval is half-open, just like Strudel's cycle arcs. Do not
  // count an onset exactly at the beginning of the following cycle.
  const steps = Math.floor((cycles - Number.EPSILON * 16) / dt)
  let sawCyclePulse = false

  for (let step = 1; step <= steps; step += 1) {
    const frame = runtime.step?.(dt, [0]) as number[]
    sawCyclePulse ||= frame[8] > 0
    for (let voice = 0; voice < 4; voice += 1) {
      const gate = frame[voice * 2 + 1]
      if (gate > 0 && previousGates[voice] <= 0) {
        events.push({
          cycle: step * dt,
          gate,
          midi: 60 + frame[voice * 2] * 12,
        })
      }
      previousGates[voice] = gate
    }
  }

  return { events, sawCyclePulse }
}

afterEach(() => {
  while (engines.length > 0) engines.pop()?.global.close()
})

describe('bundled Strudel mini-notation player', () => {
  it('loads its hardcoded stress pattern and drives four pitch/gate voices plus cycle pulse', async () => {
    const { runtime, program, rawInit } = await loadPattern()

    expect(program.inputKinds).toEqual(['trigger'])
    expect(program.outputCount).toBe(9)
    expect(program.outputNames).toEqual([
      'Pitch 1', 'Gate 1', 'Pitch 2', 'Gate 2',
      'Pitch 3', 'Gate 3', 'Pitch 4', 'Gate 4', 'Cycle',
    ])
    expect(program.parameters.map((parameter) => parameter.name)).toEqual([
      'Tempo', 'Gate', 'Seed',
    ])
    expect(
      validateProgramContract(runtime.program, rawInit)
        .filter((finding) => finding.severity === 'error'),
    ).toEqual([])

    const played = play(runtime, 4)
    expect(played.sawCyclePulse).toBe(true)
    expect(played.events.length).toBeGreaterThan(20)
    expect(new Set(played.events.map((event) => Math.round(event.midi))).size).toBeGreaterThan(8)
    expect(played.events.some((event) => event.gate === 4)).toBe(true)
  })

  it.each([
    ['sequence, nesting, rests, and stack', 'c4 [d4 e4] ~ -,g3', 4],
    ['slow sequence', '<c4 d4>', 2],
    ['weight', 'c4@2 d4', 2],
    ['spaced tie', 'c4 _ d4', 2],
    ['replication', 'c4!2 d4', 3],
    ['integer fast', '[c4 d4]*2', 4],
    ['decimal fast', 'c4*2.5', 3],
    ['decimal slow', '[c4 d4]/2.5', 2],
  ])('runs %s semantics', async (_name, pattern, expectedEvents) => {
    const { runtime } = await loadPattern(pattern)
    const cycles = pattern.includes('/2.5') ? 2.5 : pattern.includes('<') ? 2 : 1
    expect(play(runtime, cycles).events).toHaveLength(expectedEvents)
  })

  it('runs deterministic choice, degradation, and Euclidean rhythms', async () => {
    const choiceA = await loadPattern('c4|d4|e4')
    const firstChoiceRun = play(choiceA.runtime, 8).events.map((event) => Math.round(event.midi))
    const choiceB = await loadPattern('c4|d4|e4')
    const secondChoiceRun = play(choiceB.runtime, 8).events.map((event) => Math.round(event.midi))
    expect(firstChoiceRun).toEqual(secondChoiceRun)
    expect(firstChoiceRun).toHaveLength(8)
    expect(new Set(firstChoiceRun).size).toBeGreaterThan(1)

    const alwaysRemoved = await loadPattern('c4?1')
    expect(play(alwaysRemoved.runtime, 2).events).toEqual([])
    const neverRemoved = await loadPattern('c4?0')
    expect(play(neverRemoved.runtime, 2).events).toHaveLength(2)

    const euclidean = await loadPattern('c4(3,8,1)')
    expect(play(euclidean.runtime, 1).events).toHaveLength(3)
  })

  it('allows independently cycling stack lanes inside angle brackets', async () => {
    const { runtime } = await loadPattern('<c4 d4, e4 f4 g4>')
    const notes = play(runtime, 6).events.map((event) => Math.round(event.midi))

    expect(notes).toHaveLength(12)
    expect(notes.slice(0, 6)).toEqual([60, 64, 62, 65, 60, 67])
  })

  it.each([
    ['polymeter least-common-multiple alignment', '{c4 e4 g4, c3 g3}', 12],
    ['fixed polymeter steps', '{c4 e4 g4, c3 g3}%4', 8],
    ['feet', 'c4 d4 . e4 . f4', 4],
    ['ascending range', '60 .. 63', 4],
    ['descending range', '63 .. 60', 4],
  ])('runs %s', async (_name, pattern, expectedEvents) => {
    const { runtime } = await loadPattern(pattern)
    expect(play(runtime, 1).events).toHaveLength(expectedEvents)
  })

  it('preserves colon payloads as event velocity', async () => {
    const { runtime } = await loadPattern('60:0.8')
    expect(play(runtime, 1).events).toEqual([
      expect.objectContaining({ gate: 4, midi: 60 }),
    ])
  })

  it('rejects malformed and unbounded constructs during init', async () => {
    const lua = await createDistingLuaTestEngine(100)
    engines.push(lua)
    const unmatched = await loadLuaProgramRuntime(lua, sourceWithPattern('[c4 d4'))
    unmatched.configure(1, LUA_SCRIPT_PARAMETER_OFFSET)
    expect(() => unmatched.init?.()).toThrow(/expected ']'/)

    const excessive = await loadLuaProgramRuntime(lua, sourceWithPattern('c4(3,129)'))
    excessive.configure(1, LUA_SCRIPT_PARAMETER_OFFSET)
    expect(() => excessive.init?.()).toThrow(/segments <= 128/)
  })
})
