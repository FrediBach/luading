import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLuaSourceIndex } from '../validation/source-index'
import { simulatorDefaultsFromSource } from './simulator-defaults'

const INPUT_DEFAULT_TYPES = new Set([
  'Gate',
  'Manual / DC',
  'Note Sequencer (V/Oct)',
  'Sine LFO',
  'Triangle LFO',
  'Trigger',
])

const OUTPUT_DEFAULT_TYPES = new Set([
  'Hi-hat Trigger',
  'Kick Trigger',
  'Off',
  'Snare Trigger',
  'Synth Note',
  'Synth Trigger',
])

function bundledScripts() {
  const root = join(process.cwd(), 'lua-scripts')
  return readdirSync(root, { withFileTypes: true }).flatMap((group) => {
    if (!group.isDirectory()) return []
    const directory = join(root, group.name)
    return readdirSync(directory)
      .filter((name) => name.endsWith('.lua'))
      .map((name) => join(directory, name))
  })
}

function annotationType(
  source: string,
  range: { endLine: number; endColumn: number },
) {
  const line = source.split('\n')[range.endLine - 1] ?? ''
  return line.slice(range.endColumn - 1).match(/--\s*Type\s*:\s*([^,\r\n]+)/)?.[1]?.trim()
}

describe('simulator source annotations', () => {
  it('reads explicit input generator and output audio defaults from trailing comments', () => {
    const source = `
return {
  init = function()
    return {
      inputs = {
        kCV,      -- Type: Gate, Synced: True, Division: 1/8
        kTrigger, -- Type: Sine LFO, Synced: false
        kCV,      -- Type: Note Sequencer (V/Oct), Division: 1 bar
      },
      outputs = {
        kStepped, -- Type: Kick Trigger
        kLinear,  -- Type: Synth Note (V/Oct)
        kLinear,  -- Type: Off
      },
    }
  end,
}`

    const defaults = simulatorDefaultsFromSource(
      source,
      ['cv', 'trigger', 'cv'],
      3,
    )

    expect(defaults.inputSources[0]).toMatchObject({
      shape: 'gate',
      timing: { mode: 'clock', division: '1/8' },
      pulseWidth: 0.5,
    })
    expect(defaults.inputSources[1]).toMatchObject({
      shape: 'sine',
      timing: { mode: 'free', frequencyHz: 1 },
    })
    expect(defaults.inputSources[2]).toMatchObject({
      shape: 'noteSequencer',
      timing: { mode: 'clock', division: '1 bar' },
      amplitude: 1,
    })
    expect(defaults.outputAudioRoutes).toEqual(['kick', 'synthNote', 'off'])
  })

  it('keeps hardware-derived defaults when annotations are absent or invalid', () => {
    const source = `
return {
  init = function()
    return {
      inputs = {
        kGate, -- An ordinary explanation
        kCV,   -- Type: Unknown, Synced: perhaps, Division: 1/64
      },
      outputs = { kLinear },
    }
  end,
}`

    const defaults = simulatorDefaultsFromSource(source, ['gate', 'cv'], 1)

    expect(defaults.inputSources[0]).toMatchObject({
      shape: 'gate',
      timing: { mode: 'clock', division: '1/4' },
    })
    expect(defaults.inputSources[1]).toMatchObject({
      shape: 'manual',
      timing: { mode: 'free', frequencyHz: 1 },
    })
    expect(defaults.outputAudioRoutes).toEqual(['off'])
  })

  it('does not treat comments on later lines as entry annotations', () => {
    const source = `return {
  init = function()
    return {
      inputs = {
        kCV,
        -- Type: Gate, Synced: true
      },
    }
  end,
}`

    expect(simulatorDefaultsFromSource(source, ['cv'], 0).inputSources[0]?.shape)
      .toBe('manual')
  })

  it('parses, normalizes, and safely repairs freeform CV point annotations', () => {
    const parsed = simulatorDefaultsFromSource(`return {
  init = function()
    return {
      inputs = {
        kCV, -- Type: Freeform CV, Points: 0.75@20|bad|0.25@-4|0.25@3
      },
    }
  end,
}`, ['cv'], 0).inputSources[0]

    expect(parsed).toMatchObject({
      shape: 'freeform',
      freeformPoints: [
        { phase: 0, volts: 3 },
        { phase: 0.25, volts: 3 },
        { phase: 0.75, volts: 10 },
        { phase: 1, volts: 10 },
      ],
    })

    const repaired = simulatorDefaultsFromSource(`return {
  init = function()
    return {
      inputs = {
        kCV, -- Type: Freeform CV, Points: nope
      },
    }
  end,
}`, ['cv'], 0).inputSources[0]
    expect(repaired?.freeformPoints).toEqual([
      { phase: 0, volts: 0 },
      { phase: 1, volts: 0 },
    ])
  })

  it('keeps every bundled script channel explicitly and recognizably annotated', () => {
    const scripts = bundledScripts()
    expect(scripts).toHaveLength(71)

    for (const path of scripts) {
      const source = readFileSync(path, 'utf8')
      const index = createLuaSourceIndex(source, 0)
      const label = relative(process.cwd(), path)
      expect(index.semanticLocations['init.inputs-table'], `${label} inputs`).toBeDefined()
      expect(index.semanticLocations['init.outputs-table'], `${label} outputs`).toBeDefined()

      const entryRanges = (field: 'inputs' | 'outputs') => Object.entries(
        index.semanticLocations,
      ).filter(([key]) => key.match(new RegExp(`^init\\.${field}\\[\\d+\\]$`)))

      const inputs = entryRanges('inputs')
      const outputs = entryRanges('outputs')
      for (const [key, range] of inputs) {
        expect(
          INPUT_DEFAULT_TYPES.has(annotationType(source, range) ?? ''),
          `${label} ${key}`,
        ).toBe(true)
      }
      for (const [key, range] of outputs) {
        expect(
          OUTPUT_DEFAULT_TYPES.has(annotationType(source, range) ?? ''),
          `${label} ${key}`,
        ).toBe(true)
      }

      const defaults = simulatorDefaultsFromSource(
        source,
        inputs.map(() => 'cv'),
        outputs.length,
      )
      expect(defaults.inputSources, `${label} parsed inputs`).toHaveLength(inputs.length)
      expect(defaults.outputAudioRoutes, `${label} parsed outputs`).toHaveLength(outputs.length)
    }
  })
})
