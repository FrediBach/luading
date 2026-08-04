/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { callbackOutputEntries } from '../emulation/callback-output'
import { DistingDisplayApi } from '../emulation/display-api'
import { findFirstTextOverflow } from '../emulation/display-bounds'
import {
  describeProgram,
  type LuaInitResult,
  type LuaProgramRuntime,
} from '../emulation/lua-contract'
import { loadLuaProgramRuntime } from '../emulation/lua-runtime'
import { createDistingLuaTestEngine } from '../testing/lua-test-environment'
import type { DrawCommand } from '../types'

const source = readFileSync(
  join(process.cwd(), 'lua-scripts/fredi-bach/Automatonnetz.lua'),
  'utf8',
)

type Cell = {
  transform: number
  transpose: number
  inversion: number
  mutation: number
}

type StoredState = {
  settings: {
    dx: number
    dy: number
    mode: number
    octave: number
    outputMode: number
    clearMode: number
  }
  cells: Cell[]
  positionX?: number
  positionY?: number
}

const engines: Awaited<ReturnType<typeof createDistingLuaTestEngine>>[] = []

function cell(overrides: Partial<Cell> = {}): Cell {
  return {
    transform: 1,
    transpose: 0,
    inversion: 0,
    mutation: 1,
    ...overrides,
  }
}

function state(overrides: Partial<StoredState['settings']> = {}): StoredState {
  return {
    settings: {
      dx: 8,
      dy: 0,
      mode: 1,
      octave: 0,
      outputMode: 1,
      clearMode: 1,
      ...overrides,
    },
    cells: Array.from({ length: 25 }, () => cell()),
  }
}

function voltages(value: unknown) {
  return Object.fromEntries(callbackOutputEntries(value) ?? []) as Record<number, number>
}

function inputs(root = 0, inversion = 0) {
  return [0, 0, 0, 0, 0, root, inversion]
}

function controlStep(runtime: LuaProgramRuntime, values = inputs()) {
  return voltages(runtime.step?.(0.001, values))
}

function clock(runtime: LuaProgramRuntime, input = 1, values = inputs()) {
  runtime.trigger?.(input)
  return controlStep(runtime, values)
}

async function createHarness(restored = state()) {
  const lua = await createDistingLuaTestEngine(50)
  engines.push(lua)
  const display = new DistingDisplayApi()
  display.register(lua.global)
  const runtime = await loadLuaProgramRuntime(lua, source)
  runtime.configure(1, 0)
  runtime.setState(restored)
  const rawInit = runtime.init?.()
  const init = rawInit && typeof rawInit === 'object'
    ? rawInit as LuaInitResult
    : {}
  const program = describeProgram(runtime.program, init)
  return { display, program, runtime }
}

function frameText(commands: DrawCommand[]) {
  return commands
    .filter((command) => command.kind === 'text')
    .map((command) => command.text)
}

afterEach(() => {
  while (engines.length > 0) engines.pop()?.global.close()
})

describe('Automatonnetz recreation', () => {
  it('declares the adapted clocks, controls, CVs, and four output channels', async () => {
    const { program } = await createHarness()

    expect(program.inputCount).toBe(7)
    expect(program.outputCount).toBe(4)
    expect(program.inputNames).toEqual([
      'Grid clock', 'Arp clock', 'Reset', 'Arp inhibit',
      'Clear grid', 'Root CV', 'Inversion CV',
    ])
    expect(program.outputNames).toEqual([
      'Root / Aux', 'Triad 1', 'Triad 2', 'Triad 3',
    ])
    expect(program.parameters).toHaveLength(0)
  })

  it('uses fractional vectors as clock division and transforms only after entering a new cell', async () => {
    const restored = state({ dx: 4 }) // 1/5 cell per clock
    restored.cells[1] = cell({ transform: 2 }) // P in row 1, column 2
    const { runtime } = await createHarness(restored)

    for (let count = 0; count < 4; count += 1) {
      expect(clock(runtime)[3]).toBeCloseTo(4 / 12)
    }
    expect(clock(runtime)).toMatchObject({
      2: 0,
      3: 3 / 12,
      4: 7 / 12,
    })
  })

  it('wraps vectors around the five-by-five grid in either direction', async () => {
    const restored = state({ dx: 39 }) // 4 1/2 cells, equivalent to -1/2
    restored.cells[4] = cell({ transform: 2 }) // row 1, column 5
    const { runtime } = await createHarness(restored)

    expect(clock(runtime)[3]).toBeCloseTo(3 / 12)
    const stored = runtime.serialise?.() as { positionX: number }
    expect(stored.positionX).toBe(3780)
  })

  it('preserves the involutive P, L, R, N, S, and H transform behavior', async () => {
    for (let transform = 2; transform <= 7; transform += 1) {
      const restored = state()
      restored.cells[1] = cell({ transform })
      restored.cells[2] = cell({ transform })
      const { runtime } = await createHarness(restored)

      clock(runtime)
      const twice = clock(runtime)
      expect(twice[2]).toBeCloseTo(0)
      expect(twice[3]).toBeCloseTo(4 / 12)
      expect(twice[4]).toBeCloseTo(7 / 12)
    }
  })

  it('quantizes root CV and applies cell offset, inversion, and octave', async () => {
    const restored = state({ octave: 1 })
    restored.cells[1] = cell({ transpose: 12, inversion: 1 })
    const { runtime } = await createHarness(restored)

    const result = clock(runtime, 1, inputs(0.49))
    expect(result[1]).toBeCloseTo(2.5)
    expect(result[2]).toBeCloseTo(1 + 22 / 12)
    expect(result[3]).toBeCloseTo(1 + 25 / 12)
    expect(result[4]).toBeCloseTo(1 + 30 / 12)
  })

  it('resets at the next grid clock and clears with the selected grid policy', async () => {
    const restored = state({ clearMode: 1 })
    restored.cells[1] = cell({ transform: 2 })
    const { runtime } = await createHarness(restored)

    clock(runtime)
    runtime.gate?.(3, true)
    expect(clock(runtime)[3]).toBeCloseTo(4 / 12)
    runtime.gate?.(3, false)

    clock(runtime, 5)
    const stored = runtime.serialise?.() as {
      positionX: number
      cells: Cell[]
    }
    expect(stored.positionX).toBe(0)
    expect(stored.cells).toHaveLength(25)
    expect(stored.cells.every((entry) => (
      entry.transform === 1
      && entry.transpose === 0
      && entry.inversion === 0
      && entry.mutation === 1
    ))).toBe(true)
  })

  it('emits the original 5 V one-control-step trigger mode', async () => {
    const restored = state({ outputMode: 2 })
    restored.cells[1] = cell({ transform: 2 })
    const { runtime } = await createHarness(restored)

    expect(clock(runtime)[1]).toBe(5)
    expect(controlStep(runtime)[1]).toBe(0)
  })

  it('cycles arpeggios and lets strums run once before holding their final note', async () => {
    const arpeggio = await createHarness(state({ outputMode: 3 }))
    expect(controlStep(arpeggio.runtime)[1]).toBeCloseTo(0)
    expect(clock(arpeggio.runtime, 2)[1]).toBeCloseTo(4 / 12)
    arpeggio.runtime.gate?.(4, true)
    expect(clock(arpeggio.runtime, 2)[1]).toBeCloseTo(4 / 12)

    const strumState = state({ outputMode: 4 })
    strumState.cells[1] = cell({ transform: 2 })
    const strum = await createHarness(strumState)
    expect(clock(strum.runtime)[1]).toBeCloseTo(0)
    expect(clock(strum.runtime, 2)[1]).toBeCloseTo(3 / 12)
    expect(clock(strum.runtime, 2)[1]).toBeCloseTo(7 / 12)
    expect(clock(strum.runtime, 2)[1]).toBeCloseTo(7 / 12)
  })

  it('edits grid cells through the two custom encoders and round-trips preset state', async () => {
    const first = await createHarness()
    first.runtime.callUi?.('encoder1Turn', 1)
    first.runtime.callUi?.('encoder1Push')
    first.runtime.callUi?.('encoder2Push')
    first.runtime.callUi?.('encoder2Turn', 2)

    const edited = first.runtime.serialise?.() as {
      selectedCell: number
      cellPage: boolean
      cells: Cell[]
    }
    expect(edited.selectedCell).toBe(2)
    expect(edited.cellPage).toBe(true)
    expect(edited.cells[1]?.transform).toBe(3)

    const restored = await createHarness(edited as unknown as StoredState)
    expect(restored.runtime.serialise?.()).toEqual(edited)
  })

  it('renders the complete grid, editor state, and voiced chord in bounds', async () => {
    const { display, runtime } = await createHarness()
    display.reset()

    expect(runtime.draw?.()).toBe(true)
    const commands = [...display.commands]
    expect(frameText(commands)).toEqual(expect.arrayContaining([
      'AUTOMATONNETZ', 'GRID 1,1', 'dx', 'dy', 'Mode', 'Oct', 'OutA', 'Clr',
    ]))
    expect(commands.filter((command) => (
      command.kind === 'box' && !command.fill
    ))).toHaveLength(25)
    expect(findFirstTextOverflow(commands)).toBeUndefined()
  })
})
