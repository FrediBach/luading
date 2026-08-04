/// <reference types="node" />

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { LuaFactory } from 'wasmoon'
import type { LuaEngineLike } from '../emulation/lua-runtime'
import {
  createLuaValidationService,
  syntaxErrorRange,
  validateLuaSourceWithEngine,
} from './syntax-validator'
import type { ValidationWorkerResponse } from './types'
import {
  clearOutdatedSyntaxDiagnostics,
  createValidationResponse,
  isCurrentValidationResponse,
} from './worker-protocol'
import { createLuaSourceIndex } from './source-index'

type Engine = Awaited<ReturnType<LuaFactory['createEngine']>>
let lua: Engine

beforeAll(async () => {
  lua = await new LuaFactory().createEngine()
})

afterAll(() => {
  lua.global.close()
})

describe('Lua syntax validation', () => {
  it('accepts long brackets and Lua 5.4 operators and numeric forms', async () => {
    const diagnostics = await validateLuaSourceWithEngine(lua, `
      --[=[ a long comment with ]] inside ]=]
      local text = [==[a long string with ]=] inside]==]
      local hex = 0x1.fp+2
      local integer = ((7 // 2) << 1) | (8 >> 2)
      return { value = (integer & 7) ~ #text, hex = hex }
    `)

    expect(diagnostics.filter((diagnostic) => diagnostic.origin === 'syntax')).toEqual([])
  })

  it('returns an actionable range for a malformed token', async () => {
    const source = [
      '-- Syntax range',
      '-- A deliberately malformed script.',
      'return {',
      '  value = )',
      '}',
    ].join('\n')
    const diagnostics = await validateLuaSourceWithEngine(lua, source)
    const syntax = diagnostics.find((diagnostic) => diagnostic.origin === 'syntax')

    expect(syntax).toMatchObject({
      ruleId: 'lua-syntax',
      severity: 'error',
      category: 'contract',
      target: 'simulator',
      message: expect.stringContaining("unexpected symbol near ')'"),
      detail: expect.stringContaining("simulator's Lua 5.4 runtime"),
      range: {
        startLine: 4,
        startColumn: 11,
        endLine: 4,
        endColumn: 12,
      },
    })
  })

  it('keeps static findings alongside compiler diagnostics', async () => {
    const diagnostics = await validateLuaSourceWithEngine(
      lua,
      'return { value = ) }',
    )

    expect(diagnostics.map((diagnostic) => diagnostic.origin)).toEqual(
      expect.arrayContaining(['static', 'syntax']),
    )
  })

  it('uses the end of the reported line when Lua only reports EOF', () => {
    expect(syntaxErrorRange(
      'local value = {\n  1,\n',
      "script.lua:3: '}' expected (to close '{' at line 1) near <eof>",
    )).toEqual({
      startLine: 3,
      startColumn: 1,
      endLine: 3,
      endColumn: 1,
    })
  })

  it('never executes the compiled user chunk', async () => {
    lua.global.set('__syntaxValidatorExecuted', false)
    const diagnostics = await validateLuaSourceWithEngine(lua, `
      __syntaxValidatorExecuted = true
      while true do end
    `)

    expect(diagnostics.some((diagnostic) => diagnostic.origin === 'syntax')).toBe(false)
    expect(lua.global.get('__syntaxValidatorExecuted')).toBe(false)
  })

  it('serializes requests through one reusable engine', async () => {
    let activeCompilations = 0
    let maximumActiveCompilations = 0
    const engine: LuaEngineLike = {
      global: { set: vi.fn() },
      doString: vi.fn(async () => {
        activeCompilations += 1
        maximumActiveCompilations = Math.max(
          maximumActiveCompilations,
          activeCompilations,
        )
        await new Promise((resolve) => setTimeout(resolve, 5))
        activeCompilations -= 1
        return null
      }),
    }
    const createEngine = vi.fn(async () => engine)
    const service = createLuaValidationService(createEngine)

    await Promise.all([
      service.validate('return { value = 1 }'),
      service.validate('return { value = 2 }'),
      service.validate('return { value = 3 }'),
    ])

    expect(createEngine).toHaveBeenCalledTimes(1)
    expect(engine.doString).toHaveBeenCalledTimes(3)
    expect(maximumActiveCompilations).toBe(1)
  })

  it('rejects responses for stale source versions', () => {
    const response: ValidationWorkerResponse = createValidationResponse(
      4,
      [],
      createLuaSourceIndex('return {}', 4),
    )

    expect(response.version).toBe(4)
    expect(response.sourceIndex.version).toBe(4)
    expect(isCurrentValidationResponse(response, 4)).toBe(true)
    expect(isCurrentValidationResponse(response, 5)).toBe(false)
  })

  it('clears only outdated syntax findings while the next result is pending', () => {
    const diagnostics = [
      {
        id: 'syntax:old',
        ruleId: 'lua-syntax',
        severity: 'error' as const,
        category: 'contract' as const,
        target: 'simulator' as const,
        origin: 'syntax' as const,
        message: 'Old syntax error',
        detail: 'Stale.',
        penalty: 0,
      },
      {
        id: 'static:keep',
        ruleId: 'static-rule',
        severity: 'warning' as const,
        category: 'api' as const,
        target: 'hardware' as const,
        origin: 'static' as const,
        message: 'Keep static finding',
        detail: 'Still visible while validation is pending.',
        penalty: 1,
      },
    ]

    expect(clearOutdatedSyntaxDiagnostics(diagnostics)).toEqual([diagnostics[1]])
  })

  it('compiles every bundled script through the editor validation path', async () => {
    const roots = [
      join(process.cwd(), 'lua-scripts/expert-sleepers'),
      join(process.cwd(), 'lua-scripts/fredi-bach'),
    ]
    const files = roots.flatMap((root) => (
      readdirSync(root)
        .filter((filename) => filename.endsWith('.lua'))
        .map((filename) => join(root, filename))
    ))
    const syntaxFailures: string[] = []

    for (const path of files) {
      try {
        const diagnostics = await validateLuaSourceWithEngine(
          lua,
          readFileSync(path, 'utf8'),
        )
        if (diagnostics.some((diagnostic) => diagnostic.origin === 'syntax')) {
          syntaxFailures.push(path)
        }
      } catch (error) {
        syntaxFailures.push(`${path}: ${String(error)}`)
        break
      }
    }

    expect(files).toHaveLength(67)
    expect(syntaxFailures).toEqual([])
  })
})
