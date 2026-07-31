import { describe, expect, it } from 'vitest'
import { LuaFactory } from 'wasmoon'
import {
  DISTING_API,
  DISTING_API_BY_NAME,
  DISTING_CONSTANTS,
  DISTING_LIFECYCLE,
  DISTING_LIFECYCLE_BY_NAME,
} from '../validation/api-manifest'
import {
  apiEntryForIntelliSense,
  COMPLETE_SCRIPT_SNIPPET,
  constantEntryForIntelliSense,
  lifecycleEntryForIntelliSense,
} from './disting-intellisense'

function expandSnippetDefaults(snippet: string) {
  return snippet.replace(/\$\{\d+:([^}]*)\}/g, '$1')
}

async function compileOnly(source: string) {
  const lua = await new LuaFactory().createEngine()
  try {
    lua.global.set('__editorSnippetSource', source)
    return await lua.doString(`
      local _, errorMessage = load(__editorSnippetSource, "@editor-snippet.lua", "t")
      return errorMessage
    `)
  } finally {
    lua.global.close()
  }
}

describe('Disting IntelliSense API support', () => {
  it('shows non-full support levels and API-specific limitations', () => {
    const cpu = DISTING_API_BY_NAME.get('getCpuCycleCount')
    const midi = DISTING_API_BY_NAME.get('sendMIDI')

    expect(cpu && apiEntryForIntelliSense(cpu)).toMatchObject({
      detail: expect.stringContaining('browser approximation'),
      documentation: expect.stringContaining('not a Disting NT CPU-cycle measurement'),
    })
    expect(midi && apiEntryForIntelliSense(midi)).toMatchObject({
      detail: expect.stringContaining('simulator mock'),
      documentation: expect.stringContaining('not transmitted to a MIDI destination'),
    })
  })

  it('does not add a caveat to fully simulated APIs', () => {
    const drawText = DISTING_API_BY_NAME.get('drawText')
    const entry = drawText && apiEntryForIntelliSense(drawText)

    expect(entry?.detail).not.toContain('simulation')
    expect(entry?.documentation).not.toContain('Simulator support')
    expect(entry?.documentation).toContain('Contract source: manual 1.12')
  })

  it('distinguishes documented constants from compatibility aliases', () => {
    const documented = DISTING_CONSTANTS.find((entry) => entry.name === 'kMs')!
    const compatibility = DISTING_CONSTANTS.find((entry) => entry.name === 'kMilliseconds')!

    expect(constantEntryForIntelliSense(documented)).toMatchObject({
      detail: expect.stringContaining('manual 1.12'),
      documentation: expect.stringContaining('Documented by'),
    })
    expect(constantEntryForIntelliSense(compatibility)).toMatchObject({
      detail: expect.stringContaining('observed in official scripts'),
      documentation: expect.stringContaining('not documented by the 1.12 manual'),
    })
  })

  it('derives lifecycle signatures and snippets from the lifecycle catalog', () => {
    const gate = DISTING_LIFECYCLE_BY_NAME.get('gate')!
    const completion = lifecycleEntryForIntelliSense(gate)

    expect(completion).toMatchObject({
      label: 'gate callback',
      signature: 'gate = function(self, input, rising)',
      insertText: expect.stringContaining('gate = function(self, input, rising)'),
      documentation: expect.stringContaining('On each gate edge'),
    })
  })

  it('starts the complete script scaffold with both hardware header comments', () => {
    expect(COMPLETE_SCRIPT_SNIPPET.insertText?.split('\n').slice(0, 3)).toEqual([
      '-- ${1:Algorithm name}',
      '-- ${2:Describe what the script does.}',
      'local out = {}',
    ])
  })

  it('compiles default API and lifecycle snippet expansions with Lua 5.4', async () => {
    const apiCalls = DISTING_API.map((entry) => (
      expandSnippetDefaults(apiEntryForIntelliSense(entry).insertText ?? '')
    )).join('\n')
    const lifecycleFields = DISTING_LIFECYCLE.map((entry) => (
      expandSnippetDefaults(lifecycleEntryForIntelliSense(entry).insertText ?? '')
    )).join('\n')
    const completeScript = expandSnippetDefaults(COMPLETE_SCRIPT_SNIPPET.insertText ?? '')

    expect(await compileOnly(`return function()\n${apiCalls}\nend`)).toBeNull()
    expect(await compileOnly(`return {\n${lifecycleFields}\n}`)).toBeNull()
    expect(await compileOnly(completeScript)).toBeNull()
  })
})
