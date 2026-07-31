import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LuaFactory, type LuaEngine } from 'wasmoon'
import type { LuaProgram } from '../emulation/lua-contract'
import { validateProgramContract } from './contract-validator'
import {
  applySourceEdits,
  quickFixesForDiagnostic,
} from './diagnostic-actions'
import { createLuaSourceIndex } from './source-index'
import { validateLuaSource } from './static-validator'
import type { ScriptDiagnostic } from './types'

let lua: LuaEngine

beforeAll(async () => {
  lua = await new LuaFactory().createEngine()
})

afterAll(() => {
  lua.global.close()
})

async function expectCompiles(source: string) {
  lua.global.set('__quickFixSource', source)
  expect(await lua.doString(`
    local _, errorMessage = load(__quickFixSource, "@quick-fix.lua", "t")
    return errorMessage
  `)).toBeNull()
}

function actionFor(
  source: string,
  diagnostic: ScriptDiagnostic,
  actionId?: string,
) {
  const actions = quickFixesForDiagnostic(
    source,
    diagnostic,
    createLuaSourceIndex(source, 1),
  )
  return actionId ? actions.find((action) => action.id === actionId) : actions[0]
}

function applyAction(source: string, diagnostic: ScriptDiagnostic, actionId?: string) {
  const action = actionFor(source, diagnostic, actionId)
  expect(action).toBeDefined()
  return applySourceEdits(source, action!.edits)
}

function contractFinding(
  program: LuaProgram,
  metadata: unknown,
  ruleId: string,
) {
  const diagnostic = validateProgramContract(program, metadata)
    .find((entry) => entry.ruleId === ruleId)
  expect(diagnostic).toBeDefined()
  return diagnostic!
}

describe('diagnostic quick fixes', () => {
  it('inserts both missing header comments or only a missing description', () => {
    const missingBoth = 'return {}'
    const bothDiagnostic = validateLuaSource(missingBoth)
      .find((entry) => entry.ruleId === 'missing-header-comment')!
    expect(applyAction(missingBoth, bothDiagnostic)).toBe(
      '-- Script name\n-- Describe what the script does.\nreturn {}',
    )

    const missingDescription = '-- Script name\nreturn {}'
    const descriptionDiagnostic = validateLuaSource(missingDescription)
      .find((entry) => entry.ruleId === 'missing-description-comment')!
    expect(applyAction(missingDescription, descriptionDiagnostic)).toBe(
      '-- Script name\n-- Describe what the script does.\nreturn {}',
    )
  })

  it('inserts missing identity fields and edge callbacks into the returned table', async () => {
    const source = `-- Fixture
-- Exercises safe insertions.
return {
  init = function() return { inputs = { kTrigger, kGate } } end,
}`
    const index = createLuaSourceIndex(source, 1)
    const diagnostics = validateProgramContract({}, { inputs: [2, 1] })
    const fixed = ['missing-program-name', 'missing-program-author', 'missing-trigger-callback', 'missing-gate-callback']
      .reduce((current, ruleId) => {
        const diagnostic = diagnostics.find((entry) => entry.ruleId === ruleId)!
        const action = quickFixesForDiagnostic(current, diagnostic, createLuaSourceIndex(current, 1))[0]
        return applySourceEdits(current, action.edits)
      }, source)

    expect(index.semanticLocations['top-level-table']).toBeDefined()
    expect(fixed).toContain('name = "Script name",')
    expect(fixed).toContain('author = "Author",')
    expect(fixed).toContain('trigger = function(self, input)')
    expect(fixed).toContain('gate = function(self, input, rising)')
    await expectCompiles(fixed)
  })

  it('offers documented replacements for invalid field constants', () => {
    const source = `-- Constants
-- Uses invalid bus modes.
return { init = function() return {
  inputs = { 7 },
  outputs = { 9 },
  parameters = { { "Gain", 0, 10, 5, 99, 7 } },
} end }`
    const diagnostics = validateProgramContract({}, {
      inputs: [7],
      outputs: [9],
      parameters: [['Gain', 0, 10, 5, 99, 7]],
    })
    const cases = [
      ['inputs-type-1', 'kCV'],
      ['outputs-type-1', 'kStepped'],
      ['parameter-1-unit', 'kNone'],
      ['parameter-1-scale', 'kBy10'],
    ] as const

    for (const [ruleId, replacement] of cases) {
      const actions = quickFixesForDiagnostic(
        source,
        diagnostics.find((entry) => entry.ruleId === ruleId)!,
        createLuaSourceIndex(source, 1),
      )
      expect(actions[0]).toMatchObject({
        title: `Replace with ${replacement}`,
        preferred: true,
      })
      expect(applySourceEdits(source, actions[0].edits)).toContain(replacement)
    }
  })

  it('adds the required full-bright drawing colour only to eligible calls', async () => {
    const source = `-- Draw
-- Omits a required colour.
return { draw = function()
  drawLine(0, 0, math.max(2, 4), 8)
end }`
    const diagnostic = validateLuaSource(source)
      .find((entry) => entry.ruleId === 'api-argument-count')!
    const fixed = applyAction(source, diagnostic)

    expect(fixed).toContain('drawLine(0, 0, math.max(2, 4), 8, 15)')
    await expectCompiles(fixed)
    const unrelated = { ...diagnostic, ruleId: 'drawing-outside-draw' }
    expect(quickFixesForDiagnostic(source, unrelated, createLuaSourceIndex(source, 1))).toEqual([])
  })

  it('converts simple direct parameter assignments to setParameter()', async () => {
    const source = `-- Parameter write
-- Uses the documented setter instead.
return { step = function(self)
  self.parameters[2] = self.parameters[1] + 4 -- preserve this
end }`
    const diagnostic = validateLuaSource(source)
      .find((entry) => entry.ruleId === 'readonly-parameters')!
    const fixed = applyAction(source, diagnostic)

    expect(fixed).toContain(
      'setParameter(self.algorithmIndex, self.parameterOffset + 2, self.parameters[1] + 4) -- preserve this',
    )
    await expectCompiles(fixed)
  })

  it('inserts valid MIDI metadata and callback scaffolding', async () => {
    const missingMetadata = `-- MIDI
-- Needs filter metadata.
return {
  init = function() return {} end,
  midiMessage = function(self, message) end,
}`
    const metadataDiagnostic = contractFinding(
      { init: () => ({}), midiMessage: () => undefined },
      {},
      'missing-midi-metadata',
    )
    const withMetadata = applyAction(missingMetadata, metadataDiagnostic)
    expect(withMetadata).toContain('parameters = { { "MIDI channel", 0, 16, 0 } },')
    expect(withMetadata).toContain('midi = { channelParameter = 1, messages = { "note", "cc" } },')
    await expectCompiles(withMetadata)

    const missingCallback = `-- MIDI
-- Needs a callback.
return {
  init = function() return {
    parameters = { { "MIDI channel", 0, 16, 0 } },
    midi = { channelParameter = 1, messages = { "note" } },
  } end,
}`
    const callbackDiagnostic = contractFinding(
      { init: () => ({}) },
      {
        parameters: [['MIDI channel', 0, 16, 0]],
        midi: { channelParameter: 1, messages: ['note'] },
      },
      'missing-midi-callback',
    )
    const withCallback = applyAction(missingCallback, callbackDiagnostic)
    expect(withCallback).toContain(
      'midiMessage = function(self, message)',
    )
    await expectCompiles(withCallback)
  })

  it('does not offer transformations for unsafe diagnostic classes', () => {
    const source = '-- Unsafe\n-- Do not move code.\nreturn {}'
    const diagnostic: ScriptDiagnostic = {
      id: 'static:drawing',
      ruleId: 'drawing-outside-draw',
      severity: 'warning',
      category: 'contract',
      target: 'hardware',
      origin: 'static',
      message: 'Drawing outside draw',
      detail: 'Unsafe to move automatically.',
      penalty: 0,
    }
    expect(quickFixesForDiagnostic(source, diagnostic, createLuaSourceIndex(source, 1))).toEqual([])
  })
})
