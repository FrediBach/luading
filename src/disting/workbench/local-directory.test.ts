import { describe, expect, it, vi } from 'vitest'
import { listDirectoryScripts, writeDirectoryScript, type LocalDirectoryHandle, type LocalFileHandle } from './local-directory'

function file(name: string, text = 'old') {
  const stream = { write: vi.fn(async () => undefined), close: vi.fn(async () => undefined), abort: vi.fn(async () => undefined) }
  const handle: LocalFileHandle = { kind: 'file', name, getFile: async () => ({ text: async () => text }), createWritable: vi.fn(async () => stream) }
  return { handle, stream }
}
describe('local directory adapter', () => {
  it('lists only immediate Lua files, sorted, including uppercase extensions', async () => {
    const directory: LocalDirectoryHandle = {
      name: 'scripts', requestPermission: async () => 'granted',
      async *values() { yield file('z.LUA').handle; yield { kind: 'directory', name: 'nested.lua' }; yield file('a.lua').handle; yield file('readme.txt').handle },
    }
    expect((await listDirectoryScripts(directory)).map((entry) => entry.name)).toEqual(['a.lua', 'z.LUA'])
  })
  it('writes and closes unchanged disk files', async () => {
    const { handle, stream } = file('a.lua')
    await writeDirectoryScript(handle, 'old', 'new')
    expect(stream.write).toHaveBeenCalledWith('new')
    expect(stream.close).toHaveBeenCalledOnce()
  })
  it('refuses external edits before opening a writable stream', async () => {
    const { handle } = file('a.lua', 'external')
    await expect(writeDirectoryScript(handle, 'old', 'new')).rejects.toThrow('changed on disk')
    expect(handle.createWritable).not.toHaveBeenCalled()
  })
  it('aborts a failed write and propagates permission or deletion errors', async () => {
    const { handle, stream } = file('a.lua')
    stream.write.mockRejectedValueOnce(new Error('Disk full'))
    await expect(writeDirectoryScript(handle, 'old', 'new')).rejects.toThrow('Disk full')
    expect(stream.abort).toHaveBeenCalledOnce()
    expect(stream.close).not.toHaveBeenCalled()
    handle.getFile = async () => { throw new Error('File removed') }
    await expect(writeDirectoryScript(handle, 'old', 'new')).rejects.toThrow('File removed')
  })
})
