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

const scriptSource = readFileSync(
  join(process.cwd(), 'lua-scripts/fredi-bach/LUT Logic Router.lua'),
  'utf8',
)

const engines: Awaited<ReturnType<typeof createDistingLuaTestEngine>>[] = []

function sourceWithLut(lut: string) {
  const replacement = `local LUT = [==[\n${lut}\n]==]`
  const source = scriptSource.replace(
    /local LUT = \[==\[[\s\S]*?\]==\]/,
    replacement,
  )
  expect(source).not.toBe(scriptSource)
  return source
}

async function loadLut(lut?: string) {
  const lua = await createDistingLuaTestEngine(50)
  engines.push(lua)
  const display = new DistingDisplayApi()
  display.register(lua.global)
  const runtime = await loadLuaProgramRuntime(
    lua,
    lut === undefined ? scriptSource : sourceWithLut(lut),
  )
  runtime.configure(1, 0)
  const rawInit = runtime.init?.()
  const init = rawInit && typeof rawInit === 'object'
    ? rawInit as LuaInitResult
    : {}
  const program = describeProgram(runtime.program, init)
  return { display, program, rawInit, runtime }
}

afterEach(() => {
  while (engines.length > 0) engines.pop()?.global.close()
})

describe('bundled LUT logic router', () => {
  it('derives a three-input, four-output gate schema from its hardcoded LUT', async () => {
    const { program, rawInit, runtime } = await loadLut()

    expect(program.inputKinds).toEqual(['gate', 'gate', 'gate'])
    expect(program.inputNames).toEqual(['In 1', 'In 2', 'In 3'])
    expect(program.outputKinds).toEqual(['stepped', 'stepped', 'stepped', 'stepped'])
    expect(program.outputNames).toEqual(['Out 1', 'Out 2', 'Out 3', 'Out 4'])
    expect(
      validateProgramContract(runtime.program, rawInit)
        .filter((finding) => finding.severity === 'error'),
    ).toEqual([])
  })

  it('routes an enabled gate to the output selected by the two address inputs', async () => {
    const { runtime } = await loadLut()

    expect(runtime.step?.(0.001, [0, 0, 0])).toEqual([0, 0, 0, 0])
    expect(runtime.gate?.(1, true)).toEqual([5, 0, 0, 0])
    expect(runtime.gate?.(2, true)).toEqual([0, 0, 5, 0])
    expect(runtime.gate?.(3, true)).toEqual([0, 0, 0, 5])
    expect(runtime.gate?.(1, false)).toEqual([0, 0, 0, 0])
    expect(runtime.gate?.(2, false)).toEqual([0, 0, 0, 0])
    expect(runtime.gate?.(1, true)).toEqual([0, 5, 0, 0])
  })

  it('derives different port counts without changes outside the LUT string', async () => {
    const { program, runtime } = await loadLut(`
000
110
101
011
`)

    expect(program.inputCount).toBe(2)
    expect(program.outputCount).toBe(3)
    expect(runtime.gate?.(2, true)).toEqual([5, 5, 0])
    expect(runtime.gate?.(1, true)).toEqual([0, 5, 5])
  })

  it.each([
    ['an empty table', '', /must contain at least one row/],
    ['non-binary text', '0\nX', /line 2 must contain only 0 and 1/],
    ['unequal row widths', '00\n0', /line 2 has width 1; expected 2/],
    ['a non-power-of-two row count', '0\n0\n0', /row count 3 is not a power of two/],
    ['too many outputs', `${'0'.repeat(29)}\n${'0'.repeat(29)}`, /maximum is 28/],
  ])('rejects %s during init', async (_name, lut, expected) => {
    await expect(loadLut(lut)).rejects.toThrow(expected)
  })

  it('draws the derived words and dimensions within the display', async () => {
    const { display, runtime } = await loadLut()
    runtime.gate?.(1, true)
    runtime.gate?.(3, true)
    display.reset()

    expect(runtime.draw?.()).toBe(true)
    expect(display.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'text', text: 'LUT LOGIC ROUTER' }),
      expect.objectContaining({ kind: 'text', text: '3 IN / 4 OUT' }),
      expect.objectContaining({ kind: 'text', text: 'IN  101' }),
      expect.objectContaining({ kind: 'text', text: 'OUT 0100' }),
    ]))
    expect(findFirstTextOverflow(display.commands)).toBeUndefined()
  })
})
