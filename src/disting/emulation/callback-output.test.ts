import { describe, expect, it } from 'vitest'
import { LuaFactory } from 'wasmoon'
import { callbackOutputEntries } from './callback-output'

describe('callbackOutputEntries', () => {
  it('treats JavaScript undefined and Wasmoon Lua nil as no output update', async () => {
    const lua = await new LuaFactory().createEngine()
    const callback = await lua.doString(`
      local script = { gate = function(self, input, rising) end }
      return function() return script:gate(1, true) end
    `) as () => unknown

    expect(callbackOutputEntries(undefined)).toBeUndefined()
    expect(callback()).toBeNull()
    expect(callbackOutputEntries(callback())).toBeUndefined()
    lua.global.close()
  })

  it('accepts dense, sparse, and empty output tables', () => {
    expect(callbackOutputEntries([1, 2])).toEqual([[1, 1], [2, 2]])
    expect(callbackOutputEntries({ 2: 4 })).toEqual([[2, 4]])
    expect(callbackOutputEntries({})).toEqual([])
  })

  it('preserves sparse Lua output indices across the Wasmoon boundary', async () => {
    const lua = await new LuaFactory().createEngine()
    const callback = await lua.doString('return function() return { [2] = 4 } end') as () => unknown

    expect(callbackOutputEntries(callback())).toEqual([[2, 4]])
    lua.global.close()
  })

  it('rejects non-table callback values', () => {
    expect(callbackOutputEntries(false)).toBeNull()
    expect(callbackOutputEntries(4)).toBeNull()
    expect(callbackOutputEntries('4V')).toBeNull()
  })
})
