import { describe, expect, it } from 'vitest'
import { loadLuaProgramRuntime } from '../emulation/lua-runtime'
import { createDistingLuaTestEngine } from '../testing/lua-test-environment'
import { validateProgramContract } from '../validation/contract-validator'
import { validateLuaSource } from '../validation/static-validator'
import {
  createLuaScriptDownload,
  luaDownloadFilename,
  NEW_DISTING_SCRIPT,
  readLuaScriptFile,
} from './script-file'

describe('Lua script file helpers', () => {
  it('loads the new-script scaffold through Lua and produces a working CV output', async () => {
    const lua = await createDistingLuaTestEngine()

    try {
      const runtime = await loadLuaProgramRuntime(lua, NEW_DISTING_SCRIPT)
      const init = runtime.init?.()
      const findings = validateProgramContract(runtime.program, init)

      expect(findings.filter((finding) => finding.severity === 'error')).toEqual([])
      expect(validateLuaSource(NEW_DISTING_SCRIPT)
        .filter((finding) => finding.severity === 'error')).toEqual([])
      expect(init).toMatchObject({ inputs: [0], outputs: [1] })
      expect(runtime.step?.(0.001, [3.25])).toEqual([3.25])
      runtime.close?.()
    } finally {
      lua.global.close()
    }
  })

  it('creates safe Lua download names without duplicating the extension', () => {
    expect(luaDownloadFilename('Vector LFO')).toBe('Vector LFO.lua')
    expect(luaDownloadFilename('clock.lua')).toBe('clock.lua')
    expect(luaDownloadFilename('Bad/name:*  ')).toBe('Bad-name-.lua')
    expect(luaDownloadFilename(' . ')).toBe('disting-script.lua')
  })

  it('removes a UTF-8 BOM when importing source', async () => {
    await expect(readLuaScriptFile({
      text: async () => '\uFEFFreturn { name = "Imported" }',
    })).resolves.toBe('return { name = "Imported" }')
  })

  it('keeps the exported source byte-for-byte in a Lua text blob', async () => {
    const source = '-- custom script\nreturn {}\n'
    const download = createLuaScriptDownload(source, 'custom.lua')

    expect(download.filename).toBe('custom.lua')
    expect(download.blob.type).toBe('text/x-lua;charset=utf-8')
    await expect(download.blob.text()).resolves.toBe(source)
  })
})
