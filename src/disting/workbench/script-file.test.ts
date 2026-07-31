import { describe, expect, it } from 'vitest'
import {
  createLuaScriptDownload,
  luaDownloadFilename,
  readLuaScriptFile,
} from './script-file'

describe('Lua script file helpers', () => {
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
