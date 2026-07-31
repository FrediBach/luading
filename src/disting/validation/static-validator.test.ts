import { describe, expect, it } from 'vitest'
import { DEFAULT_DISTING_SCRIPT } from '../default-script'
import { validateLuaSource } from './static-validator'

function rules(source: string) {
  return validateLuaSource(source).map((item) => item.ruleId)
}

describe('validateLuaSource', () => {
  it('accepts the default script without hard errors', () => {
    const findings = validateLuaSource(DEFAULT_DISTING_SCRIPT)
    expect(findings.filter((item) => item.severity === 'error')).toEqual([])
  })

  it('reports a missing second header comment independently', () => {
    const findings = validateLuaSource('-- Script name\nreturn {}')

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'missing-description-comment',
        range: expect.objectContaining({ startLine: 2, startColumn: 1 }),
      }),
    ]))
  })

  it('reports allocation in the 1 kHz callback', () => {
    expect(rules(`
-- Hot output
-- Allocates on every step.
return {
  step = function(self, dt, inputs)
    return { inputs[1] }
  end,
}
    `)).toContain('hot-table-allocation')
  })

  it('does not report tables allocated outside step', () => {
    expect(rules(`
-- Reused output
-- Keeps its output table at script scope.
local out = {}
return {
  trigger = function(self, input)
    out[1] = input
    return out
  end,
}
    `)).not.toContain('hot-table-allocation')
  })

  it('reports drawing from a non-draw callback', () => {
    const findings = validateLuaSource(`
-- Invalid drawing
-- Draws from step.
return {
  step = function()
    drawText(10, 10, "wrong")
  end,
}
    `)
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'drawing-outside-draw',
        severity: 'warning',
        callback: 'step',
      }),
    ]))
  })

  it('reports direct writes to self.parameters', () => {
    expect(rules(`
-- Read-only parameter
-- Mutates firmware state incorrectly.
return {
  step = function(self)
    self.parameters[1] = 4
  end,
}
    `)).toContain('readonly-parameters')
  })

  it('reports a compatibility note for partially simulated APIs', () => {
    const findings = validateLuaSource(`
-- Partial UI
-- Uses a documented API with placeholder behavior.
return {
  draw = function(self)
    drawAlgorithmUI(self.algorithmIndex)
    drawAlgorithmUI(self.algorithmIndex)
  end,
}
    `)

    expect(findings.filter((item) => item.ruleId === 'simulator-api-partial')).toEqual([
      expect.objectContaining({
        severity: 'info',
        category: 'compatibility',
        target: 'simulator',
        message: 'drawAlgorithmUI() is only partially simulated',
      }),
    ])
  })

  it('distinguishes browser approximations, mocks, and unsupported APIs', () => {
    const findings = validateLuaSource(`
-- Support levels
-- Exercises non-full simulator adapters.
getCpuCycleCount()
sendMIDI(1, 0x90, 60, 100)
exit()
    `)

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'simulator-api-approximation' }),
      expect.objectContaining({ ruleId: 'simulator-api-mock' }),
      expect.objectContaining({ ruleId: 'simulator-api-unsupported' }),
    ]))
  })

  it('checks documented API argument counts', () => {
    const finding = validateLuaSource(`
-- Bad call
-- Missing the text argument.
return {
  draw = function()
    drawText(10, 10)
  end,
}
    `).find((item) => item.ruleId === 'api-argument-count')

    expect(finding).toMatchObject({
      severity: 'warning',
      category: 'api',
    })
  })

  it('requires drawing colours documented by the manual', () => {
    const findings = validateLuaSource(`
-- Drawing colours
-- Omits required primitive colours.
return {
  draw = function()
    drawBox(0, 0, 10, 10)
    drawCircle(5, 5, 2)
    drawLine(0, 0, 10, 10)
    drawRectangle(0, 0, 10, 10)
    drawSmoothCircle(5, 5, 2)
    drawSmoothLine(0, 0, 10, 10)
  end,
}
    `).filter((item) => item.ruleId === 'api-argument-count')

    expect(findings).toHaveLength(6)
    expect(findings.every((item) => item.detail.includes('expects 5 arguments')
      || item.detail.includes('expects 4 arguments'))).toBe(true)
  })

  it('enforces the one-to-three MIDI-byte range', () => {
    const findings = validateLuaSource(`
-- MIDI arity
-- Exercises the bounded byte list.
sendMIDI(0x4)
sendMIDI(0x4, 0x90)
sendMIDI(0x4, 0x90, 60, 100)
sendMIDI(0x4, 0x90, 60, 100, 0)
    `).filter((item) => item.ruleId === 'api-argument-count')

    expect(findings.map((item) => item.message)).toEqual([
      'sendMIDI() received 1 arguments',
      'sendMIDI() received 5 arguments',
    ])
    expect(findings.every((item) => item.detail.includes('expects 2–4 arguments'))).toBe(true)
  })

  it('accepts byte-list and table I2C overloads', () => {
    const findings = validateLuaSource(`
-- I2C overloads
-- Uses both documented command forms.
sendI2CCommand(0x32, 0x46, 7)
sendI2CCommand(0x32, { 0x46, 7 })
sendI2CGetter(0x32, 2, 0x48, 7)
sendI2CGetter(0x32, 2, { 0x48, 7 })
    `)

    expect(findings.filter((item) => item.ruleId === 'api-argument-count')).toEqual([])
  })
})

describe('bundled script corpus', () => {
  const scripts = import.meta.glob('../../../lua-scripts/*/*.lua', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  it('does not produce hard static errors for the bundled scripts', () => {
    const failures = Object.entries(scripts).flatMap(([path, source]) => (
      validateLuaSource(source)
        .filter((item) => item.severity === 'error')
        .map((item) => `${path}: ${item.ruleId} at line ${item.range?.startLine ?? '?'}`)
    ))
    expect(failures).toEqual([])
    expect(Object.keys(scripts).length).toBeGreaterThanOrEqual(58)
  })
})
