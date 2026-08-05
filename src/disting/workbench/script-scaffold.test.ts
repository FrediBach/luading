import { describe, expect, it } from 'vitest'
import { describeProgram } from '../emulation/lua-contract'
import { loadLuaProgramRuntime } from '../emulation/lua-runtime'
import { parseParameterPresets } from '../emulation/parameter-presets'
import { createDistingLuaTestEngine } from '../testing/lua-test-environment'
import { validateProgramContract } from '../validation/contract-validator'
import { validateLuaSource } from '../validation/static-validator'
import { NEW_DISTING_SCRIPT } from './script-file'
import {
  createChoiceScaffoldParameter,
  createDefaultScriptScaffold,
  createMidiChannelParameter,
  createNumericScaffoldParameter,
  createScaffoldParameterPreset,
  generateScriptScaffold,
  luaQuotedString,
  scaffoldManifestIsCurrent,
} from './script-scaffold'

async function loadGenerated(source: string) {
  const lua = await createDistingLuaTestEngine()
  const runtime = await loadLuaProgramRuntime(lua, source)
  const init = runtime.init?.() ?? {}
  return { lua, runtime, init }
}

describe('new-script scaffold generator', () => {
  it('keeps the current quick-start source and pass-through behavior', async () => {
    const result = generateScriptScaffold(createDefaultScriptScaffold())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.filename).toBe('New Script.lua')
    expect(result.source).toBe(NEW_DISTING_SCRIPT)

    const { lua, runtime, init } = await loadGenerated(result.source)
    try {
      expect(validateProgramContract(runtime.program, init).filter(({ severity }) => severity === 'error')).toEqual([])
      expect(validateLuaSource(result.source).filter(({ severity }) => severity === 'error')).toEqual([])
      expect(runtime.step?.(0.001, [2.75])).toEqual([2.75])
    } finally {
      runtime.close?.()
      lua.global.close()
    }
  })

  it('generates valid zero-I/O and mixed edge scripts', async () => {
    const empty = createDefaultScriptScaffold()
    empty.inputs = []
    empty.outputs = []
    const emptyResult = generateScriptScaffold(empty)
    expect(emptyResult.ok).toBe(true)
    if (!emptyResult.ok) return
    expect(emptyResult.source).not.toContain('local outputs')

    const mixed = createDefaultScriptScaffold()
    mixed.inputs = [
      { id: 'cv', name: 'Pitch', kind: 'cv' },
      { id: 'gate', name: 'Hold', kind: 'gate' },
      { id: 'trigger', name: 'Strike', kind: 'trigger' },
    ]
    mixed.outputs = [
      { id: 'smooth', name: 'Envelope', kind: 'linear' },
      { id: 'edge', name: 'Clock', kind: 'stepped' },
    ]
    const mixedResult = generateScriptScaffold(mixed)
    expect(mixedResult.ok).toBe(true)
    if (!mixedResult.ok) return
    expect(mixedResult.source).toContain('trigger = function(self, input)')
    expect(mixedResult.source).toContain('gate = function(self, input, rising)')

    for (const source of [emptyResult.source, mixedResult.source]) {
      const { lua, runtime, init } = await loadGenerated(source)
      try {
        expect(validateProgramContract(runtime.program, init).filter(({ severity }) => severity === 'error')).toEqual([])
      } finally {
        runtime.close?.()
        lua.global.close()
      }
    }
  })

  it('renders numeric scales, choices, MIDI, and named parameter snapshots', async () => {
    const draft = createDefaultScriptScaffold()
    const rate = createNumericScaffoldParameter(1, 'rate')
    Object.assign(rate, {
      name: 'Rate', minimum: 0.1, maximum: 20, defaultValue: 1.5, unit: 'kHz', precision: 10,
    })
    const shape = createChoiceScaffoldParameter(2, 'shape')
    shape.name = 'Shape'
    const midi = createMidiChannelParameter('midi')
    draft.parameters = [rate, shape, midi]
    draft.extras.midi = { parameterId: midi.id, messages: ['note', 'cc'] }
    draft.extras.parameterPresets = [createScaffoldParameterPreset(draft, 'preset', 'Default')]

    const result = generateScriptScaffold(draft)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('{ "Rate", 1, 200, 15, kHz, kBy10 }')
    expect(result.source).toContain('{ "Shape", { "Off", "On" }, 1 }')
    expect(result.source).toContain('channelParameter = 3')
    expect(result.source).toContain('-- Luading simulator extension')

    const { lua, runtime, init } = await loadGenerated(result.source)
    try {
      expect(validateProgramContract(runtime.program, init).filter(({ severity }) => severity === 'error')).toEqual([])
      const program = describeProgram(runtime.program, init)
      const presets = parseParameterPresets(runtime.program.luading, program.parameters)
      expect(presets.diagnostics).toEqual([])
      expect(presets.presets).toEqual([{ name: 'Default', values: [1.5, 1, 0] }])
    } finally {
      runtime.close?.()
      lua.global.close()
    }
  })

  it('requires explicit consent for non-manual control callbacks', () => {
    const draft = createDefaultScriptScaffold()
    draft.controls = { customUi: true, callbacks: ['button1Push'], allowSimulatorExtensions: false }
    const rejected = generateScriptScaffold(draft)
    expect(rejected.ok).toBe(false)
    if (rejected.ok) return
    expect(rejected.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'control-provenance', step: 'controls' }),
    ]))

    draft.controls.allowSimulatorExtensions = true
    const accepted = generateScriptScaffold(draft)
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(accepted.source).toContain('not documented for hardware algorithm scripts')
    expect(accepted.summary.simulatorExtensions).toContain('Button 1 push')
  })

  it('generates valid custom display and saved-state callbacks', async () => {
    const draft = createDefaultScriptScaffold()
    draft.extras.display = 'custom-full'
    draft.extras.serialise = true
    const result = generateScriptScaffold(draft)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { lua, runtime, init } = await loadGenerated(result.source)
    try {
      expect(validateProgramContract(runtime.program, init).filter(({ severity }) => severity === 'error')).toEqual([])
      expect(runtime.draw?.()).toBe(true)
      expect(runtime.serialise?.()).toEqual({})
    } finally {
      runtime.close?.()
      lua.global.close()
    }
  })

  it('rejects invalid explicit entities without rounding or dropping them', () => {
    const draft = createDefaultScriptScaffold()
    const amount = createNumericScaffoldParameter(1, 'amount')
    amount.precision = 10
    amount.defaultValue = 0.15
    draft.parameters = [amount]
    draft.inputs[0].name = '   '
    const result = generateScriptScaffold(draft)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.findings.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'input-name',
      'parameter-precision',
    ]))
  })

  it('quotes user strings without allowing Lua injection', async () => {
    const dangerous = 'Quote " slash \\ newline\n--[[ marker ]] café \u0001'
    const draft = createDefaultScriptScaffold()
    draft.name = dangerous
    draft.description = dangerous
    draft.author = dangerous
    draft.inputs[0].name = dangerous
    const result = generateScriptScaffold(draft)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(luaQuotedString(dangerous)).toContain('\\001')
    const { lua, runtime } = await loadGenerated(result.source)
    try {
      expect(runtime.program.name).toBe(dangerous.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim())
    } finally {
      runtime.close?.()
      lua.global.close()
    }
  })

  it('keeps its curated constants and callbacks aligned with the API manifest', () => {
    expect(scaffoldManifestIsCurrent()).toBe(true)
  })
})
