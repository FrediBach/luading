import { describe, expect, it } from 'vitest'
import {
  NTLIB_EXPORT_MODULES,
  NTLIB_MODULES,
  runtimeModules,
} from './ntlib-modules'

describe('bundled ntlib modules', () => {
  it('maps the root and every submodule to package.preload names', () => {
    expect(Object.keys(NTLIB_MODULES)).toHaveLength(18)
    expect(NTLIB_MODULES.ntlib).toContain('VERSION = "1.0.0"')
    expect(NTLIB_MODULES['ntlib.quant']).toContain('M.SCALES')
    expect(NTLIB_MODULES['ntlib.test']).toContain('simulator ntlibTestLoad adapter')
  })

  it('always injects modules while preserving project-owned overrides', () => {
    const modules = runtimeModules({
      'ntlib.quant': 'return "project quant"',
      helper: 'return true',
    })
    expect(modules.ntlib).toBe(NTLIB_MODULES.ntlib)
    expect(modules['ntlib.quant']).toBe('return "project quant"')
    expect(modules.helper).toBe('return true')
  })

  it('keeps the simulator-only test harness out of hardware exports', () => {
    expect(NTLIB_EXPORT_MODULES.ntlib).toBe(NTLIB_MODULES.ntlib)
    expect(NTLIB_EXPORT_MODULES['ntlib.quant']).toBe(NTLIB_MODULES['ntlib.quant'])
    expect(NTLIB_EXPORT_MODULES['ntlib.test']).toBeUndefined()
  })
})
