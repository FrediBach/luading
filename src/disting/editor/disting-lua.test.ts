import { describe, expect, it, vi } from 'vitest'
// Monaco does not publish types for its internal Monarch compiler. Exercising
// it here ensures the local definition is accepted by the production lexer.
// @ts-expect-error no declaration is published for this internal module
import { compile } from 'monaco-editor/esm/vs/editor/standalone/common/monarch/monarchCompile.js'
import { DISTING_API, DISTING_CONSTANTS } from '../validation/api-manifest'
import {
  DISTING_LUA_LANGUAGE_CONFIGURATION,
  DISTING_LUA_LANGUAGE_ID,
  DISTING_LUA_MODEL_URI,
  DISTING_LUA_TOKENIZER,
  registerDistingLuaLanguage,
} from './disting-lua'

function createLanguageApi() {
  const dispose = vi.fn()
  const languages: Array<{ id: string }> = []
  return {
    dispose,
    api: {
      languages: {
        getLanguages: vi.fn(() => languages),
        register: vi.fn((language: { id: string }) => {
          languages.push(language)
        }),
        setLanguageConfiguration: vi.fn(() => ({ dispose })),
        setMonarchTokensProvider: vi.fn(() => ({ dispose })),
      },
    },
  }
}

describe('Disting Lua language', () => {
  it('uses a dedicated language ID and stable in-memory model URI', () => {
    expect(DISTING_LUA_LANGUAGE_ID).toBe('disting-lua')
    expect(DISTING_LUA_MODEL_URI).toBe('inmemory://disting/main.lua')
  })

  it('configures Lua comments, words, pairs, and nested block indentation', () => {
    expect(DISTING_LUA_LANGUAGE_CONFIGURATION.comments).toEqual({
      lineComment: '--',
      blockComment: ['--[[', ']]'],
    })
    expect('algorithm_2'.match(DISTING_LUA_LANGUAGE_CONFIGURATION.wordPattern!)?.[0]).toBe('algorithm_2')
    expect(DISTING_LUA_LANGUAGE_CONFIGURATION.indentationRules?.increaseIndentPattern.test('if ready then')).toBe(true)
    expect(DISTING_LUA_LANGUAGE_CONFIGURATION.indentationRules?.increaseIndentPattern.test('local run = function(self)')).toBe(true)
    expect(DISTING_LUA_LANGUAGE_CONFIGURATION.indentationRules?.increaseIndentPattern.test('if ready then -- explain')).toBe(true)
    expect(DISTING_LUA_LANGUAGE_CONFIGURATION.indentationRules?.increaseIndentPattern.test('repeat')).toBe(true)
    expect(DISTING_LUA_LANGUAGE_CONFIGURATION.indentationRules?.decreaseIndentPattern.test('  elseif ready then')).toBe(true)
    expect(DISTING_LUA_LANGUAGE_CONFIGURATION.indentationRules?.decreaseIndentPattern.test('  until ready')).toBe(true)
    expect(DISTING_LUA_LANGUAGE_CONFIGURATION.indentationRules?.decreaseIndentPattern.test('end')).toBe(true)
  })

  it('pins Lua 5.4 operators, long-bracket states, and Disting token categories', () => {
    expect(() => compile(DISTING_LUA_LANGUAGE_ID, DISTING_LUA_TOKENIZER)).not.toThrow()
    expect(DISTING_LUA_TOKENIZER.operators).toEqual(expect.arrayContaining([
      '//', '&', '|', '~', '<<', '>>', '..', '~=',
    ]))
    expect(DISTING_LUA_TOKENIZER.tokenizer).toHaveProperty('longString')
    expect(DISTING_LUA_TOKENIZER.tokenizer).toHaveProperty('longComment')
    expect(DISTING_LUA_TOKENIZER.distingFunctions).toEqual(DISTING_API.map((entry) => entry.name))
    expect(DISTING_LUA_TOKENIZER.distingConstants).toEqual(DISTING_CONSTANTS.map((entry) => entry.name))

    const rootRules = DISTING_LUA_TOKENIZER.tokenizer.root
    const longStringIndex = rootRules.findIndex((rule) => (
      Array.isArray(rule)
      && typeof rule[1] === 'object'
      && !Array.isArray(rule[1])
      && rule[1].next === '@longString.$1'
    ))
    const ordinaryBracketIndex = rootRules.findIndex((rule) => (
      Array.isArray(rule) && rule[1] === '@brackets'
    ))
    expect(longStringIndex).toBeGreaterThanOrEqual(0)
    expect(longStringIndex).toBeLessThan(ordinaryBracketIndex)
  })

  it('registers once per Monaco instance and disposes every contribution once', () => {
    const first = createLanguageApi()
    const firstRegistration = registerDistingLuaLanguage(first.api)
    const duplicateRegistration = registerDistingLuaLanguage(first.api)

    expect(duplicateRegistration).toBe(firstRegistration)
    expect(first.api.languages.register).toHaveBeenCalledTimes(1)
    expect(first.api.languages.register).toHaveBeenCalledWith(expect.objectContaining({
      id: DISTING_LUA_LANGUAGE_ID,
    }))
    expect(first.api.languages.register).not.toHaveBeenCalledWith(expect.objectContaining({
      extensions: expect.anything(),
    }))

    firstRegistration.dispose()
    firstRegistration.dispose()
    expect(first.dispose).toHaveBeenCalledTimes(2)

    const secondRegistration = registerDistingLuaLanguage(first.api)
    expect(secondRegistration).not.toBe(firstRegistration)
    expect(first.api.languages.register).toHaveBeenCalledTimes(1)
    secondRegistration.dispose()
  })
})
