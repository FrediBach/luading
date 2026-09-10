import { describe, expect, it } from 'vitest'
import { DistingDisplayApi } from '../../emulation/display-api'
import { loadLuaProgramRuntime } from '../../emulation/lua-runtime'
import { createDistingLuaTestEngine } from '../../testing/lua-test-environment'
import { renderDisplayTestPixels } from '../../testing/display-pixel-test-environment'
import { createDisplayComponentPreview, type DisplayComponentScenarioValue } from './display-component-library'
import { SEVEN_SEGMENT_COMPONENTS } from './display-component-seven-segment'
import { compileDisplayDesign } from './display-design-compiler'
import { generateDisplayDesignLua } from './display-design-generator'

function preview(index: number, state: string, values: Record<string, DisplayComponentScenarioValue> = {}) {
  const recipe = SEVEN_SEGMENT_COMPONENTS[index]!
  return createDisplayComponentPreview({ ...recipe, scenarios: [...recipe.scenarios, { id: 'test', name: 'Test', state, values }] }, 'test', { x: 0, y: 0 })
}

describe('seven-segment components', () => {
  it('renders recognizable digits, minus and blank at every size with independent decimal and brightness', () => {
    // Segment masks are sampled clockwise from the top, then the middle.
    const masks = ['1111110', '0110000', '1101101', '1111001', '0110011', '1011011', '1011111', '1110000', '1111111', '1111011', '0000001', '0000000']
    for (const [index, recipe] of SEVEN_SEGMENT_COMPONENTS.entries()) {
      for (const [stateIndex, state] of recipe.states.slice(0, 12).entries()) {
        const document = preview(index, state.value, { brightness: 0.6, offBrightness: 0, decimalPoint: true })
        const compiled = compileDisplayDesign(document)
        const pixels = renderDisplayTestPixels(compiled.commands)
        expect(compiled.commands).toHaveLength(8)
        for (const [segment, command] of compiled.commands.entries()) {
          if (command.kind !== 'box') throw new Error('Expected segment rectangle')
          expect(command.shade).toBe(segment === 7 || masks[stateIndex]![segment] === '1' ? 9 : 0)
          expect(pixels[command.y1 * 256 + command.x1]).toBe(command.shade)
        }
      }
    }
  })

  it('controls each custom segment independently and ignores custom inputs in digit states', () => {
    for (let index = 0; index < 3; index += 1) {
      for (const [position, segment] of [...'ABCDEFG'].entries()) {
        const values = { [`segment${segment}`]: true, offBrightness: 0 }
        const commands = compileDisplayDesign(preview(index, 'custom', values)).commands
        expect(commands.map(({ shade }) => shade)).toEqual(Array.from({ length: 8 }, (_, i) => i === position ? 15 : 0))
        expect(compileDisplayDesign(preview(index, 'blank', values)).commands.every(({ shade }) => shade === 0)).toBe(true)
      }
    }
  })

  it('exports every state and custom overlay through the production Lua/display bridge', async () => {
    for (const [index, recipe] of SEVEN_SEGMENT_COMPONENTS.entries()) {
      for (const state of recipe.states) {
        const lua = await createDistingLuaTestEngine(50)
        try {
          const display = new DistingDisplayApi()
          display.register(lua.global)
          const document = preview(index, state.value, { decimalPoint: true, segmentA: true, segmentG: true, brightness: 0.6, offBrightness: 0.2 })
          const generated = generateDisplayDesignLua(document)
          expect(generated.ok).toBe(true)
          const runtime = await loadLuaProgramRuntime(lua, `return {\n${generated.source}}`)
          display.reset()
          expect(runtime.draw?.()).toBe(true)
          expect(display.commands).toEqual(compileDisplayDesign(document).commands)
          runtime.close?.()
        } finally {
          lua.global.close()
        }
      }
    }
  })
})
