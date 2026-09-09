/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DistingDisplayApi } from '../emulation/display-api'
import { findFirstTextOverflow } from '../emulation/display-bounds'
import { describeProgram, type LuaInitResult } from '../emulation/lua-contract'
import { loadLuaProgramRuntime } from '../emulation/lua-runtime'
import { createDistingLuaTestEngine } from '../testing/lua-test-environment'
import { validateProgramContract } from './contract-validator'

const source = readFileSync(join(process.cwd(), 'lua-scripts/fredi-bach/Logic Gate Schema Builder.lua'), 'utf8')
const engines: Awaited<ReturnType<typeof createDistingLuaTestEngine>>[] = []
type State = { version: number; cells: number[]; column: number; row: number }

async function load(state?: unknown) {
  const lua = await createDistingLuaTestEngine()
  engines.push(lua)
  const display = new DistingDisplayApi()
  display.register(lua.global)
  const runtime = await loadLuaProgramRuntime(lua, source)
  runtime.configure(1, 0)
  if (state !== undefined) runtime.setState(state)
  const rawInit = runtime.init?.()
  const program = describeProgram(runtime.program, rawInit as LuaInitResult)
  const step = () => runtime.step?.(0.001, [0, 0, 0, 0])
  const saved = () => runtime.serialise?.() as State
  return { runtime, display, program, rawInit, step, saved }
}

function patch(entries: Record<number, number>) {
  const cells = Array<number>(32).fill(1)
  for (const [index, tile] of Object.entries(entries)) cells[Number(index) - 1] = tile
  return { version: 1, cells, column: 1, row: 1 }
}

afterEach(() => { while (engines.length) engines.pop()?.global.close() })

describe('Logic Gate Schema Builder', () => {
  it('loads a valid four-gate/four-output contract and evaluates all demo input words', async () => {
    const { runtime, program, rawInit, step } = await load()
    expect(program.inputKinds).toEqual(Array(4).fill('gate'))
    expect(program.outputKinds).toEqual(Array(4).fill('stepped'))
    expect(validateProgramContract(runtime.program, rawInit).filter(f => f.severity === 'error')).toEqual([])
    expect(runtime.ui?.()).toBe(true)
    for (let word = 0; word < 16; word++) {
      const bits = [0, 1, 2, 3].map(bit => Boolean(word & (1 << bit)))
      bits.forEach((high, index) => runtime.gate?.(index + 1, high))
      expect(step()).toEqual([bits[0] ? 5 : 0, bits[0] && bits[1] ? 5 : 0,
        bits[2] !== bits[3] ? 5 : 0, bits[3] ? 0 : 5])
    }
  })

  it.each([
    [6, [0, 5, 0, 5]], [7, [0, 0, 5, 5]], [8, [0, 5, 5, 5]],
    [9, [5, 0, 5, 0]], [10, [0, 0, 0, 5]], [11, [0, 5, 5, 5]],
    [12, [0, 5, 5, 0]], [13, [5, 5, 5, 0]], [14, [5, 0, 0, 0]],
  ])('evaluates tile %i from west/north truth tables in one step', async (tile, expected) => {
    const { runtime, step } = await load(patch({ 2: 3, 9: 2, 10: tile, 11: 15 }))
    for (let word = 0; word < 4; word++) {
      runtime.gate?.(1, Boolean(word & 1))
      runtime.gate?.(2, Boolean(word & 2))
      expect(step()).toEqual([expected[word], 0, 0, 0])
    }
  })

  it('fans out east/south, ORs duplicate outputs and resets disconnected outputs', async () => {
    const { runtime, step } = await load(patch({ 1: 2, 2: 6, 3: 15, 9: 7, 10: 16, 17: 3, 18: 15 }))
    runtime.gate?.(1, true)
    expect(step()).toEqual([5, 5, 0, 0])
    runtime.gate?.(1, false)
    runtime.gate?.(2, true)
    expect(step()).toEqual([5, 0, 0, 0])
    runtime.gate?.(2, false)
    expect(step()).toEqual([0, 0, 0, 0])
    runtime.gate?.(1, true)
    runtime.callUi?.('pot3Push') // I1 -> empty; no latched voltages after editing.
    expect(step()).toEqual([0, 0, 0, 0])
  })

  it('treats boundaries as low without wrapping signal paths between rows', async () => {
    const { runtime, step } = await load(patch({ 8: 2, 9: 6, 10: 15, 2: 7, 3: 16 }))
    runtime.gate?.(1, true)
    expect(step()).toEqual([0, 0, 0, 0])
  })

  it('wraps encoder navigation and cycles every tile in both directions with presses only', async () => {
    const { runtime, saved } = await load(patch({}))
    runtime.callUi?.('encoder1Turn', -1)
    runtime.callUi?.('encoder2Turn', -1)
    expect(saved()).toMatchObject({ column: 8, row: 4 })
    for (let tile = 2; tile <= 18; tile++) {
      runtime.callUi?.('encoder2Push')
      runtime.callUi?.('encoder2Release')
      expect(saved().cells[31]).toBe(tile)
    }
    runtime.callUi?.('encoder2Push')
    expect(saved().cells[31]).toBe(1)
    runtime.callUi?.('pot3Push')
    runtime.callUi?.('pot3Release')
    expect(saved().cells[31]).toBe(18)
    runtime.callUi?.('encoder1Turn', 9)
    runtime.callUi?.('encoder2Turn', 5)
    expect(saved()).toMatchObject({ column: 1, row: 1 })
  })

  it('round-trips edited layouts through JSON without retaining input levels', async () => {
    const original = await load()
    original.runtime.callUi?.('encoder1Turn', 4)
    original.runtime.callUi?.('encoder2Push')
    original.runtime.gate?.(1, true)
    original.step()
    const snapshot = original.saved()
    const restored = await load(JSON.parse(JSON.stringify(snapshot)))
    expect(restored.saved()).toEqual(snapshot)
    expect(restored.step()).toEqual([0, 0, 0, 5])
    snapshot.cells[0] = 1
    expect(original.saved().cells[0]).toBe(2)
  })

  it('normalizes malformed saved cells and cursor positions', async () => {
    const { saved, step } = await load({ version: 1, cells: [999, '2', -1, 1.5], column: 50, row: -1 })
    expect(saved()).toEqual(patch({}))
    expect(step()).toEqual([0, 0, 0, 0])
  })

  it('renders high backgrounds with dark labels, a separate cursor, and bounded text for every tile', async () => {
    const { runtime, display, step } = await load()
    runtime.gate?.(1, true)
    step()
    display.reset()
    expect(runtime.draw?.()).toBe(true)
    expect(display.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'text', text: 'I1', shade: 0 }),
      expect.objectContaining({ kind: 'text', text: 'I2', shade: 9 }),
    ]))
    expect(display.commands.filter(c => c.kind === 'box' && c.fill && c.shade === 15)).toHaveLength(7)
    runtime.callUi?.('encoder1Turn', 7)
    runtime.callUi?.('encoder2Turn', 3)
    for (let tile = 1; tile <= 18; tile++) {
      display.reset()
      step()
      runtime.draw?.()
      expect(findFirstTextOverflow(display.commands)).toBeUndefined()
      runtime.callUi?.('encoder2Push')
    }
  })
})
