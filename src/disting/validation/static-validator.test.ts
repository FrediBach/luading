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

  it('recognizes newly implemented hardware APIs as simulator-compatible', () => {
    const findings = validateLuaSource(`
-- Simulated UI
-- Uses a documented API implemented by the simulator.
return {
  draw = function(self)
    drawAlgorithmUI(self.algorithmIndex)
  end,
}
    `)

    expect(findings.some((item) => item.ruleId === 'simulator-api-unsupported')).toBe(false)
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
