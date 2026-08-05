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
  type LuaProgramRuntime,
} from '../emulation/lua-contract'
import { loadLuaProgramRuntime } from '../emulation/lua-runtime'
import { serialiseJsonState } from '../emulation/runtime-helpers'
import { createDistingLuaTestEngine } from '../testing/lua-test-environment'
import { DISTING_DISPLAY, type DrawCommand } from '../types'

const source = readFileSync(
  join(process.cwd(), 'lua-scripts/fredi-bach/Micro Tracker.lua'),
  'utf8',
)

const TRACKS = 4
const PATTERNS = 8
const ROWS = 16
const CELLS = TRACKS * PATTERNS * ROWS

type TrackerSettings = {
  clock: number
  tempo: number
  rowsPerBeat: number
  gate: number
  swing: number
  transpose: number
  mode: number
  seed: number
}

type TrackerState = {
  version: number
  settings: TrackerSettings
  notes: number[]
  velocities: number[]
  probabilities: number[]
  ratchets: number[]
  song: number[]
  selectedPattern: number
  cursorRow: number
  cursorTrack: number
  mutes: boolean[]
  rng: number
}

type TrackerHarness = {
  display: DistingDisplayApi
  lua: Awaited<ReturnType<typeof createDistingLuaTestEngine>>
  program: ReturnType<typeof describeProgram>
  runtime: LuaProgramRuntime
}

function cellIndex(pattern: number, row: number, track: number) {
  return ((pattern - 1) * ROWS + (row - 1)) * TRACKS + track - 1
}

async function createTrackerHarness(state?: TrackerState): Promise<TrackerHarness> {
  const lua = await createDistingLuaTestEngine(500)
  const display = new DistingDisplayApi()
  display.register(lua.global)
  const runtime = await loadLuaProgramRuntime(lua, source)
  runtime.configure(1, 0)
  if (state) runtime.setState(state)
  const rawInit = runtime.init?.()
  const init = rawInit && typeof rawInit === 'object'
    ? rawInit as LuaInitResult
    : {}
  const program = describeProgram(runtime.program, init)
  return { display, lua, program, runtime }
}

function serialise(runtime: LuaProgramRuntime) {
  return runtime.serialise?.() as TrackerState
}

function outputValues(value: unknown) {
  return Object.fromEntries(callbackOutputEntries(value) ?? []) as Record<number, number>
}

function step(runtime: LuaProgramRuntime, inputs = [0, 0, 0]) {
  return outputValues(runtime.step?.(0.001, inputs))
}

function advance(runtime: LuaProgramRuntime, milliseconds: number, inputs = [0, 0, 0]) {
  let result: Record<number, number> = {}
  for (let index = 0; index < milliseconds; index += 1) result = step(runtime, inputs)
  return result
}

function callUi(runtime: LuaProgramRuntime, callback: string, value?: number) {
  runtime.callUi?.(callback, value)
}

function tapEncoder(runtime: LuaProgramRuntime) {
  callUi(runtime, 'encoder2Push')
  callUi(runtime, 'encoder2Release')
}

function holdEncoder(runtime: LuaProgramRuntime, milliseconds: number) {
  callUi(runtime, 'encoder2Push')
  advance(runtime, milliseconds)
  callUi(runtime, 'encoder2Release')
}

function selectCommand(runtime: LuaProgramRuntime, command: number) {
  holdEncoder(runtime, 500)
  if (command > 1) callUi(runtime, 'encoder1Turn', command - 1)
  tapEncoder(runtime)
}

function drawFrame(harness: TrackerHarness) {
  harness.display.reset()
  expect(harness.runtime.draw?.()).toBe(true)
  return [...harness.display.commands]
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
    }
  }
}

function blankState(state: TrackerState) {
  state.notes.fill(-1)
  state.velocities.fill(100)
  state.probabilities.fill(100)
  state.ratchets.fill(1)
  state.song = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  state.mutes = [false, false, false, false]
  state.selectedPattern = 1
  state.cursorRow = 1
  state.cursorTrack = 1
  state.rng = state.settings.seed
  return state
}

async function defaultState() {
  const harness = await createTrackerHarness()
  try {
    return structuredClone(serialise(harness.runtime))
  } finally {
    harness.lua.global.close()
  }
}

describe('Micro Tracker', () => {
  it('declares the fixed portable contract and deterministic demo state', async () => {
    const { lua, program, runtime } = await createTrackerHarness()
    try {
      expect(program.inputKinds).toEqual(['trigger', 'trigger', 'cv'])
      expect(program.inputNames).toEqual(['Clock', 'Reset', 'Transpose CV'])
      expect(program.outputKinds).toEqual(Array.from({ length: 8 }, () => 'stepped'))
      expect(program.outputNames).toEqual([
        'T1 Pitch', 'T1 Gate', 'T2 Pitch', 'T2 Gate',
        'T3 Pitch', 'T3 Gate', 'T4 Pitch', 'T4 Gate',
      ])
      expect(program.parameters).toHaveLength(0)
      expect(runtime.ui?.()).toBe(true)
      expect(runtime.setupUi?.()).toEqual([0, 1 / 3, 0])

      const state = serialise(runtime)
      expect(state.notes).toHaveLength(CELLS)
      expect(state.velocities).toHaveLength(CELLS)
      expect(state.probabilities).toHaveLength(CELLS)
      expect(state.ratchets).toHaveLength(CELLS)
      expect(state.song).toEqual([1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
      expect(state.mutes).toEqual([false, false, false, false])
      expect(state.notes[cellIndex(1, 1, 1)]).toBe(48)
      expect(state.notes[cellIndex(1, 2, 1)]).toBe(-2)
      expect(state.probabilities[cellIndex(1, 9, 2)]).toBe(75)
      expect(state.ratchets[cellIndex(1, 13, 4)]).toBe(2)
      expect(state.ratchets[cellIndex(2, 13, 4)]).toBe(4)
      expect(outputValues(runtime.step?.(0.001, [0, 0, 0]))).toEqual({
        1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0,
      })
      expect(serialiseJsonState(state).error).toBeUndefined()
      expect(JSON.stringify(state).length).toBeLessThan(20_000)
    } finally {
      lua.global.close()
    }
  })

  it('restores valid state by value and normalizes malformed fixed fields safely', async () => {
    const valid = await defaultState()
    valid.settings = {
      clock: 2, tempo: 300, rowsPerBeat: 4, gate: 90,
      swing: 60, transpose: -24, mode: 2, seed: 77,
    }
    valid.notes[cellIndex(8, 16, 4)] = 96
    valid.velocities[cellIndex(8, 16, 4)] = 1
    valid.probabilities[cellIndex(8, 16, 4)] = 0
    valid.ratchets[cellIndex(8, 16, 4)] = 4
    valid.selectedPattern = 8
    valid.cursorRow = 16
    valid.cursorTrack = 4
    valid.mutes = [true, false, true, false]
    valid.rng = 123456

    const restored = await createTrackerHarness(valid)
    try {
      valid.notes[cellIndex(8, 16, 4)] = 24
      const roundTrip = serialise(restored.runtime)
      expect(roundTrip.settings).toEqual({
        clock: 2, tempo: 300, rowsPerBeat: 4, gate: 90,
        swing: 60, transpose: -24, mode: 2, seed: 77,
      })
      expect(roundTrip.notes[cellIndex(8, 16, 4)]).toBe(96)
      expect(roundTrip.mutes).toEqual([true, false, true, false])
      expect(roundTrip.rng).toBe(123456)
      expect(restored.runtime.setupUi?.()).toEqual([1, 1, 1])

      roundTrip.notes[0] = 24
      expect(serialise(restored.runtime).notes[0]).not.toBe(24)
    } finally {
      restored.lua.global.close()
    }

    const malformedCases: Array<(state: TrackerState) => void> = [
      (state) => { state.version = 2 },
      (state) => { state.notes.pop() },
      (state) => { state.velocities[5] = Number.POSITIVE_INFINITY },
      (state) => { state.probabilities[7] = 101 },
      (state) => { state.ratchets[9] = 0 },
      (state) => { state.song.push(1) },
      (state) => { state.mutes = [false, false, false, 1 as unknown as boolean] },
      (state) => { state.settings.seed = 0; state.rng = 0 },
    ]
    for (const mutate of malformedCases) {
      const malformed = await defaultState()
      malformed.notes[0] = 24
      mutate(malformed)
      const harness = await createTrackerHarness(malformed)
      try {
        const normalized = serialise(harness.runtime)
        expect(normalized.notes).toHaveLength(CELLS)
        expect(normalized.velocities).toHaveLength(CELLS)
        expect(normalized.probabilities).toHaveLength(CELLS)
        expect(normalized.ratchets).toHaveLength(CELLS)
        expect(normalized.song).toHaveLength(16)
        expect(normalized.mutes).toHaveLength(4)
        expect(normalized.settings.seed).toBeGreaterThan(0)
        expect(normalized.rng).toBeGreaterThan(0)
      } finally {
        harness.lua.global.close()
      }
    }
  })

  it('runs the internal clock with paired swing intervals and explicit retrigger lows', async () => {
    const state = blankState(await defaultState())
    state.settings.tempo = 120
    state.settings.rowsPerBeat = 2
    state.settings.swing = 20
    state.notes[cellIndex(1, 1, 1)] = 60
    state.notes[cellIndex(1, 2, 1)] = 62
    state.notes[cellIndex(1, 3, 1)] = 64
    const harness = await createTrackerHarness(state)
    try {
      callUi(harness.runtime, 'pot3Push')
      let outputs = step(harness.runtime)
      expect(outputs[1]).toBe(0)
      expect(outputs[2]).toBeCloseTo(5 + 99 * 5 / 126)

      advance(harness.runtime, 299)
      outputs = step(harness.runtime)
      expect(outputs[1]).toBe(0)
      expect(outputs[2]).toBe(0)
      outputs = step(harness.runtime)
      expect(outputs[1]).toBeCloseTo(2 / 12)
      expect(outputs[2]).toBeGreaterThanOrEqual(5)

      advance(harness.runtime, 198)
      outputs = step(harness.runtime)
      expect(outputs[2]).toBe(0)
      outputs = step(harness.runtime)
      expect(outputs[1]).toBeCloseTo(4 / 12)

      callUi(harness.runtime, 'pot3Push')
      expect(step(harness.runtime)[2]).toBe(0)
    } finally {
      harness.lua.global.close()
    }
  })

  it('uses same-step transpose on external clocks, measured ratchets, and reset-before-clock ordering', async () => {
    const state = blankState(await defaultState())
    state.settings.clock = 2
    state.settings.transpose = 12
    state.notes[cellIndex(1, 1, 1)] = 60
    state.ratchets[cellIndex(1, 1, 1)] = 4
    state.notes[cellIndex(1, 2, 1)] = 62
    const harness = await createTrackerHarness(state)
    try {
      callUi(harness.runtime, 'pot3Push')
      harness.runtime.trigger?.(1)
      expect(step(harness.runtime, [0, 0, 0.5])[1]).toBeCloseTo(1.5)

      advance(harness.runtime, 99, [0, 0, 0.5])
      harness.runtime.trigger?.(1)
      expect(step(harness.runtime, [0, 0, 0.25])[2]).toBe(0)
      expect(step(harness.runtime, [0, 0, 0.25])[1]).toBeCloseTo(1 + 2 / 12 + 0.25)

      advance(harness.runtime, 20)
      harness.runtime.trigger?.(2)
      harness.runtime.trigger?.(1)
      const resetClock = step(harness.runtime, [0, 0, -0.5])
      expect(resetClock[1]).toBeCloseTo(0.5)
      expect(serialise(harness.runtime).rng).not.toBe(0)
    } finally {
      harness.lua.global.close()
    }
  })

  it('handles rests, ties, probability, ratchets, velocity, mute, and pitch clamps', async () => {
    const state = blankState(await defaultState())
    state.settings.clock = 2
    state.settings.transpose = 24
    state.notes[cellIndex(1, 1, 1)] = 96
    state.velocities[cellIndex(1, 1, 1)] = 127
    state.ratchets[cellIndex(1, 1, 1)] = 4
    state.notes[cellIndex(1, 2, 1)] = -2
    state.notes[cellIndex(1, 3, 1)] = 60
    state.probabilities[cellIndex(1, 3, 1)] = 0
    state.notes[cellIndex(1, 4, 1)] = -1
    const harness = await createTrackerHarness(state)
    try {
      callUi(harness.runtime, 'pot3Push')
      harness.runtime.trigger?.(1)
      let outputs = step(harness.runtime, [0, 0, 8])
      expect(outputs[1]).toBe(10)
      expect(outputs[2]).toBe(10)

      advance(harness.runtime, 249)
      expect(step(harness.runtime)[2]).toBeGreaterThanOrEqual(5)
      harness.runtime.trigger?.(1)
      outputs = step(harness.runtime)
      expect(outputs[1]).toBe(10)
      expect(outputs[2]).toBeGreaterThanOrEqual(5)

      harness.runtime.trigger?.(1)
      expect(step(harness.runtime)[2]).toBe(0)
      harness.runtime.trigger?.(1)
      expect(step(harness.runtime)[2]).toBe(0)

      holdEncoder(harness.runtime, 500)
      callUi(harness.runtime, 'encoder1Turn', 5)
      tapEncoder(harness.runtime)
      expect(step(harness.runtime)[2]).toBe(0)
    } finally {
      harness.lua.global.close()
    }
  })

  it('continues deterministic probability after serialization and reseeds on reset', async () => {
    const state = blankState(await defaultState())
    state.settings.clock = 2
    for (let row = 1; row <= ROWS; row += 1) {
      state.notes[cellIndex(1, row, 1)] = 60
      state.probabilities[cellIndex(1, row, 1)] = 50
    }
    const first = await createTrackerHarness(state)
    try {
      callUi(first.runtime, 'pot3Push')
      for (let index = 0; index < 5; index += 1) {
        first.runtime.trigger?.(1)
        step(first.runtime)
        step(first.runtime)
      }
      const saved = structuredClone(serialise(first.runtime))
      const expected: number[] = []
      for (let index = 0; index < 6; index += 1) {
        first.runtime.trigger?.(1)
        step(first.runtime)
        expected.push(step(first.runtime)[2])
      }

      const restored = await createTrackerHarness(saved)
      try {
        callUi(restored.runtime, 'pot3Push')
        const actual: number[] = []
        for (let index = 0; index < 6; index += 1) {
          restored.runtime.trigger?.(1)
          step(restored.runtime)
          actual.push(step(restored.runtime)[2])
        }
        expect(actual).toEqual(expected)

        restored.runtime.trigger?.(2)
        restored.runtime.trigger?.(1)
        const resetDecision = step(restored.runtime)[2]
        const fresh = await createTrackerHarness(state)
        try {
          callUi(fresh.runtime, 'pot3Push')
          fresh.runtime.trigger?.(1)
          expect(resetDecision).toBe(step(fresh.runtime)[2])
        } finally {
          fresh.lua.global.close()
        }
      } finally {
        restored.lua.global.close()
      }
    } finally {
      first.lua.global.close()
    }
  })

  it('keeps editor and playback positions independent and applies queued patterns at boundaries', async () => {
    const state = blankState(await defaultState())
    state.settings.tempo = 300
    state.settings.rowsPerBeat = 4
    state.notes[cellIndex(1, 1, 1)] = 60
    state.notes[cellIndex(2, 1, 1)] = 72
    const harness = await createTrackerHarness(state)
    try {
      callUi(harness.runtime, 'pot3Push')
      expect(step(harness.runtime)[1]).toBe(0)
      callUi(harness.runtime, 'pot1Turn', 1 / 7)
      expect(serialise(harness.runtime).selectedPattern).toBe(2)
      callUi(harness.runtime, 'encoder1Turn', 7)
      expect(serialise(harness.runtime).cursorRow).toBe(8)

      expect(advance(harness.runtime, 15 * 50)[2]).toBe(0)
      advance(harness.runtime, 49)
      expect(step(harness.runtime)[1]).toBe(1)
    } finally {
      harness.lua.global.close()
    }
  })

  it('advances Song slots, loops at end markers, and falls back safely for an empty order', async () => {
    const state = blankState(await defaultState())
    state.settings.clock = 2
    state.settings.mode = 2
    state.song = [1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    state.notes[cellIndex(1, 1, 1)] = 60
    state.notes[cellIndex(2, 1, 1)] = 72
    const harness = await createTrackerHarness(state)
    try {
      callUi(harness.runtime, 'pot3Push')
      harness.runtime.trigger?.(1)
      expect(step(harness.runtime)[1]).toBe(0)
      for (let event = 0; event < 15; event += 1) {
        harness.runtime.trigger?.(1)
        step(harness.runtime)
      }
      harness.runtime.trigger?.(1)
      expect(step(harness.runtime)[1]).toBe(1)
      for (let event = 0; event < 16; event += 1) {
        harness.runtime.trigger?.(1)
        step(harness.runtime)
      }
      expect(step(harness.runtime)[1]).toBe(0)

      harness.runtime.trigger?.(2)
      harness.runtime.trigger?.(1)
      expect(step(harness.runtime)[1]).toBe(0)
    } finally {
      harness.lua.global.close()
    }

    state.song.fill(0)
    const empty = await createTrackerHarness(state)
    try {
      callUi(empty.runtime, 'pot3Push')
      empty.runtime.trigger?.(1)
      expect(step(empty.runtime)[1]).toBe(0)
      advance(empty.runtime, 801)
      const frame = drawFrame(empty)
      expect(frameText(frame)).toContain('EMPTY ORDER USES P01')
      expectFrameInsideDisplay(frame)
    } finally {
      empty.lua.global.close()
    }
  })

  it('distinguishes short, long, and held-turn encoder gestures', async () => {
    const harness = await createTrackerHarness()
    try {
      callUi(harness.runtime, 'encoder2Push')
      advance(harness.runtime, 499)
      callUi(harness.runtime, 'encoder2Release')
      expect(frameText(drawFrame(harness))).toContain('NOTE')

      tapEncoder(harness.runtime)
      callUi(harness.runtime, 'encoder2Push')
      advance(harness.runtime, 500)
      expect(frameText(drawFrame(harness))).toContain('COMMANDS')
      callUi(harness.runtime, 'encoder2Release')

      holdEncoder(harness.runtime, 500)
      expect(frameText(drawFrame(harness))).not.toContain('COMMANDS')
      tapEncoder(harness.runtime)
      callUi(harness.runtime, 'encoder2Push')
      callUi(harness.runtime, 'encoder2Turn', 1)
      callUi(harness.runtime, 'encoder2Release')
      expect(frameText(drawFrame(harness))).toContain('NOTE')
      tapEncoder(harness.runtime)
      expect(serialise(harness.runtime).notes[cellIndex(1, 1, 1)]).toBe(60)
    } finally {
      harness.lua.global.close()
    }
  })

  it('maps every pattern/row/track corner and wraps only Grid navigation', async () => {
    const state = blankState(await defaultState())
    state.notes[cellIndex(1, 1, 1)] = 24
    state.notes[cellIndex(1, 16, 4)] = 36
    state.notes[cellIndex(8, 1, 1)] = 84
    state.notes[cellIndex(8, 16, 4)] = 96
    const harness = await createTrackerHarness(state)
    try {
      tapEncoder(harness.runtime)
      expect(frameText(drawFrame(harness))).toContain('C-1')
      tapEncoder(harness.runtime)

      callUi(harness.runtime, 'encoder1Turn', -1)
      callUi(harness.runtime, 'encoder2Turn', -1)
      tapEncoder(harness.runtime)
      expect(frameText(drawFrame(harness))).toContain('C-2')
      tapEncoder(harness.runtime)

      callUi(harness.runtime, 'pot1Turn', 1)
      tapEncoder(harness.runtime)
      expect(frameText(drawFrame(harness))).toContain('C-7')
      tapEncoder(harness.runtime)

      callUi(harness.runtime, 'encoder1Turn', 1)
      callUi(harness.runtime, 'encoder2Turn', 1)
      tapEncoder(harness.runtime)
      expect(frameText(drawFrame(harness))).toContain('C-6')
    } finally {
      harness.lua.global.close()
    }
  })

  it('clamps every Cell field and applies the documented coarse increments', async () => {
    const state = blankState(await defaultState())
    const harness = await createTrackerHarness(state)
    try {
      tapEncoder(harness.runtime)
      callUi(harness.runtime, 'encoder2Turn', -100)
      callUi(harness.runtime, 'encoder2Turn', 1)
      callUi(harness.runtime, 'encoder2Turn', 1)

      callUi(harness.runtime, 'encoder1Turn', 1)
      callUi(harness.runtime, 'encoder2Turn', -1_000)
      callUi(harness.runtime, 'encoder2Push')
      callUi(harness.runtime, 'encoder2Turn', 1)
      callUi(harness.runtime, 'encoder2Release')

      callUi(harness.runtime, 'encoder1Turn', 1)
      callUi(harness.runtime, 'encoder2Turn', -1_000)
      callUi(harness.runtime, 'encoder2Push')
      callUi(harness.runtime, 'encoder2Turn', 1)
      callUi(harness.runtime, 'encoder2Release')

      callUi(harness.runtime, 'encoder1Turn', 1)
      callUi(harness.runtime, 'encoder2Turn', 1_000)
      callUi(harness.runtime, 'encoder2Push')
      callUi(harness.runtime, 'encoder2Turn', -1)
      callUi(harness.runtime, 'encoder2Release')
      tapEncoder(harness.runtime)

      const committed = serialise(harness.runtime)
      const index = cellIndex(1, 1, 1)
      expect(committed.notes[index]).toBe(24)
      expect(committed.velocities[index]).toBe(17)
      expect(committed.probabilities[index]).toBe(10)
      expect(committed.ratchets[index]).toBe(3)
    } finally {
      harness.lua.global.close()
    }
  })

  it('commits cell edits as one undo transaction and serializes only committed data', async () => {
    const harness = await createTrackerHarness()
    try {
      tapEncoder(harness.runtime)
      callUi(harness.runtime, 'encoder2Turn', 1)
      callUi(harness.runtime, 'encoder2Turn', 1)
      expect(serialise(harness.runtime).notes[cellIndex(1, 1, 1)]).toBe(48)
      tapEncoder(harness.runtime)
      expect(serialise(harness.runtime).notes[cellIndex(1, 1, 1)]).toBe(50)

      holdEncoder(harness.runtime, 500)
      callUi(harness.runtime, 'encoder1Turn', 8)
      tapEncoder(harness.runtime)
      expect(serialise(harness.runtime).notes[cellIndex(1, 1, 1)]).toBe(48)
      expect(Object.keys(serialise(harness.runtime)).sort()).toEqual([
        'cursorRow', 'cursorTrack', 'mutes', 'notes', 'probabilities', 'ratchets',
        'rng', 'selectedPattern', 'settings', 'song', 'velocities', 'version',
      ])
    } finally {
      harness.lua.global.close()
    }
  })

  it('keeps destructive commands safe and copy, paste, clone, mute, and undo value-owned', async () => {
    const harness = await createTrackerHarness()
    try {
      const original = serialise(harness.runtime)
      holdEncoder(harness.runtime, 500)
      callUi(harness.runtime, 'encoder1Turn', 3)
      tapEncoder(harness.runtime)
      expect(frameText(drawFrame(harness))).toContain('CLEAR ROW 00?')
      tapEncoder(harness.runtime)
      expect(serialise(harness.runtime).notes.slice(0, 4)).toEqual(original.notes.slice(0, 4))

      holdEncoder(harness.runtime, 500)
      tapEncoder(harness.runtime)
      callUi(harness.runtime, 'encoder2Turn', 1)
      holdEncoder(harness.runtime, 500)
      callUi(harness.runtime, 'encoder1Turn', 1)
      tapEncoder(harness.runtime)
      expect(serialise(harness.runtime).notes[cellIndex(1, 1, 2)]).toBe(48)

      holdEncoder(harness.runtime, 500)
      callUi(harness.runtime, 'encoder1Turn', 5)
      tapEncoder(harness.runtime)
      expect(serialise(harness.runtime).mutes[1]).toBe(true)
      holdEncoder(harness.runtime, 500)
      callUi(harness.runtime, 'encoder1Turn', 8)
      tapEncoder(harness.runtime)
      expect(serialise(harness.runtime).mutes[1]).toBe(false)
    } finally {
      harness.lua.global.close()
    }
  })

  it('confirms row clears and pattern clones, with one-level undo restoring owned values', async () => {
    const harness = await createTrackerHarness()
    try {
      selectCommand(harness.runtime, 4)
      expect(frameText(drawFrame(harness))).toContain('CLEAR ROW 00?')
      callUi(harness.runtime, 'encoder1Turn', 1)
      tapEncoder(harness.runtime)
      expect(serialise(harness.runtime).notes.slice(0, 4)).toEqual([-1, -1, -1, -1])
      selectCommand(harness.runtime, 9)
      expect(serialise(harness.runtime).notes.slice(0, 4)).toEqual([48, 60, -1, -1])

      selectCommand(harness.runtime, 5)
      expect(frameText(drawFrame(harness))).toContain('CLONE P01 > P02?')
      callUi(harness.runtime, 'encoder1Turn', 1)
      tapEncoder(harness.runtime)
      expect(serialise(harness.runtime).notes[cellIndex(2, 2, 1)]).toBe(-2)
      selectCommand(harness.runtime, 9)
      expect(serialise(harness.runtime).notes[cellIndex(2, 2, 1)]).toBe(-1)
    } finally {
      harness.lua.global.close()
    }
  })

  it('copies cells by value, explains disabled paste, and cancels a muted track immediately', async () => {
    const state = blankState(await defaultState())
    state.settings.clock = 2
    state.notes[cellIndex(1, 1, 1)] = 60
    const harness = await createTrackerHarness(state)
    try {
      holdEncoder(harness.runtime, 500)
      callUi(harness.runtime, 'encoder1Turn', 1)
      expect(frameText(drawFrame(harness))).toContain('COPY FIRST')
      holdEncoder(harness.runtime, 500)

      selectCommand(harness.runtime, 1)
      tapEncoder(harness.runtime)
      callUi(harness.runtime, 'encoder2Turn', 2)
      tapEncoder(harness.runtime)
      expect(serialise(harness.runtime).notes[cellIndex(1, 1, 1)]).toBe(62)
      callUi(harness.runtime, 'encoder2Turn', 1)
      selectCommand(harness.runtime, 2)
      expect(serialise(harness.runtime).notes[cellIndex(1, 1, 2)]).toBe(60)

      callUi(harness.runtime, 'encoder2Turn', -1)
      callUi(harness.runtime, 'pot3Push')
      harness.runtime.trigger?.(1)
      expect(step(harness.runtime)[2]).toBeGreaterThanOrEqual(5)
      selectCommand(harness.runtime, 6)
      expect(step(harness.runtime)[2]).toBe(0)
    } finally {
      harness.lua.global.close()
    }
  })

  it('keeps worst-case four-track/four-ratchet scheduling bounded at maximum tempo', async () => {
    const state = blankState(await defaultState())
    state.settings.tempo = 300
    state.settings.rowsPerBeat = 4
    state.settings.gate = 90
    for (let row = 1; row <= ROWS; row += 1) {
      for (let track = 1; track <= TRACKS; track += 1) {
        state.notes[cellIndex(1, row, track)] = 48 + track * 3
        state.velocities[cellIndex(1, row, track)] = 127
        state.ratchets[cellIndex(1, row, track)] = 4
      }
    }
    const harness = await createTrackerHarness(state)
    try {
      callUi(harness.runtime, 'pot3Push')
      let outputs = step(harness.runtime)
      for (let millisecond = 0; millisecond < 2_000; millisecond += 1) {
        outputs = step(harness.runtime)
      }
      expect(Object.keys(outputs)).toHaveLength(8)
      expect(Object.values(outputs).every(Number.isFinite)).toBe(true)
      expect(outputs[2]).toBeGreaterThanOrEqual(0)
      expect(outputs[8]).toBeGreaterThanOrEqual(0)
    } finally {
      harness.lua.global.close()
    }
  })

  it('edits Song and Settings transactionally while pots retain fixed meanings', async () => {
    const harness = await createTrackerHarness()
    try {
      callUi(harness.runtime, 'pot1Turn', 1)
      callUi(harness.runtime, 'pot2Turn', 1)
      callUi(harness.runtime, 'pot3Turn', 1)
      expect(harness.runtime.setupUi?.()).toEqual([1, 1, 1])

      holdEncoder(harness.runtime, 500)
      callUi(harness.runtime, 'encoder1Turn', 6)
      tapEncoder(harness.runtime)
      callUi(harness.runtime, 'encoder2Turn', -1)
      expect(serialise(harness.runtime).song[0]).toBe(1)
      tapEncoder(harness.runtime)
      expect(serialise(harness.runtime).song[0]).toBe(0)

      holdEncoder(harness.runtime, 500)
      callUi(harness.runtime, 'encoder1Turn', 7)
      tapEncoder(harness.runtime)
      callUi(harness.runtime, 'encoder1Turn', 1)
      callUi(harness.runtime, 'encoder2Turn', -1)
      expect(serialise(harness.runtime).settings.tempo).toBe(300)
      tapEncoder(harness.runtime)
      expect(serialise(harness.runtime).settings.tempo).toBe(299)
    } finally {
      harness.lua.global.close()
    }
  })

  it('renders every view in bounds with bounded grid complexity and transient feedback', async () => {
    const harness = await createTrackerHarness()
    try {
      const frames: DrawCommand[][] = []
      frames.push(drawFrame(harness))
      expect(frames[0].length).toBeLessThanOrEqual(60)
      tapEncoder(harness.runtime)
      frames.push(drawFrame(harness))
      tapEncoder(harness.runtime)

      holdEncoder(harness.runtime, 500)
      frames.push(drawFrame(harness))
      callUi(harness.runtime, 'encoder1Turn', 3)
      tapEncoder(harness.runtime)
      frames.push(drawFrame(harness))
      holdEncoder(harness.runtime, 500)

      holdEncoder(harness.runtime, 500)
      callUi(harness.runtime, 'encoder1Turn', 6)
      tapEncoder(harness.runtime)
      frames.push(drawFrame(harness))
      tapEncoder(harness.runtime)

      holdEncoder(harness.runtime, 500)
      callUi(harness.runtime, 'encoder1Turn', 7)
      tapEncoder(harness.runtime)
      frames.push(drawFrame(harness))
      tapEncoder(harness.runtime)

      holdEncoder(harness.runtime, 500)
      callUi(harness.runtime, 'encoder1Turn', 9)
      tapEncoder(harness.runtime)
      frames.push(drawFrame(harness))
      callUi(harness.runtime, 'encoder1Turn', 1)
      frames.push(drawFrame(harness))
      callUi(harness.runtime, 'encoder1Turn', 1)
      frames.push(drawFrame(harness))
      tapEncoder(harness.runtime)

      for (const frame of frames) expectFrameInsideDisplay(frame)
      expect(frameText(frames[0])).toEqual(expect.arrayContaining(['P01', '...']))
      expect(frameText(frames[1])).toContain('NOTE')
      expect(frameText(frames[2])).toContain('COMMANDS')
      expect(frameText(frames[3])).toContain('CLEAR ROW 00?')
      expect(frameText(frames[4])).toContain('SONG ORDER')
      expect(frameText(frames[5])).toContain('SETTINGS')
      expect(frameText(frames[6])).toContain('HELP 1/3')

      callUi(harness.runtime, 'pot3Push')
      step(harness.runtime)
      expect(frameText(drawFrame(harness)).filter((text) => text === 'RUN')).toHaveLength(1)
      advance(harness.runtime, 801)
      expect(frameText(drawFrame(harness)).filter((text) => text === 'RUN')).toHaveLength(0)
    } finally {
      harness.lua.global.close()
    }
  })

  it('records bounded default/maximal state sizes and busiest grid command count', async () => {
    const defaults = await defaultState()
    const maximal = structuredClone(defaults)
    maximal.settings = {
      clock: 2, tempo: 300, rowsPerBeat: 4, gate: 90,
      swing: 60, transpose: 24, mode: 2, seed: 4_294_967_295,
    }
    maximal.notes.fill(96)
    maximal.velocities.fill(127)
    maximal.probabilities.fill(99)
    maximal.ratchets.fill(4)
    maximal.song.fill(8)
    maximal.selectedPattern = 8
    maximal.cursorRow = 16
    maximal.cursorTrack = 4
    maximal.mutes.fill(true)
    maximal.rng = 4_294_967_295

    expect(JSON.stringify(defaults).length).toBe(6_959)
    expect(JSON.stringify(maximal).length).toBe(6_466)

    const harness = await createTrackerHarness(maximal)
    try {
      const frame = drawFrame(harness)
      expectFrameInsideDisplay(frame)
      expect(frame.length).toBe(52)
    } finally {
      harness.lua.global.close()
    }
  })
})
