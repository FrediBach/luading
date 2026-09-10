import type { DisplayPrimitiveElement, DisplayVisibility } from './display-design-model'
import type { DisplayComponentRecipe } from './display-component-library'

// Conventional segment order: top, upper right, lower right, bottom,
// lower left, upper left, middle. The decimal point is independent.
const segments = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const
const glyphs: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
  '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  '-': 'g', blank: '',
}

function sevenSegment(size: string, width: number, height: number, thickness: number): DisplayComponentRecipe {
  const middle = Math.floor(height / 2) - Math.floor(thickness / 2)
  const rectangles = [
    [thickness + 1, 0, width - thickness - 2, thickness - 1],
    [width - thickness, thickness + 1, width - 1, middle - 2],
    [width - thickness, middle + thickness + 1, width - 1, height - thickness - 2],
    [thickness + 1, height - thickness, width - thickness - 2, height - 1],
    [0, middle + thickness + 1, thickness - 1, height - thickness - 2],
    [0, thickness + 1, thickness - 1, middle - 2],
    [thickness + 1, middle, width - thickness - 2, middle + thickness - 1],
  ] as const
  return {
    id: `seven-segment-${size.toLowerCase()}`, version: 1,
    name: `Seven segment ${size.toLowerCase()}`, category: 'controls',
    description: `${size} seven-segment digit. Set State to a string "0"–"9", "-", "blank", or "custom"; custom exposes segments A–G. Combine independently wired digits for longer numbers.`,
    tags: ['7 segment', '7-segment', 'seven-segment', 'digit', 'LED', 'decimal', 'number', 'tempo', 'counter', size.toLowerCase()],
    footprint: { width: width + thickness + 1, height },
    compatibleDisplayModes: ['parameter-line', 'full-screen'],
    states: [
      ...Array.from({ length: 10 }, (_, digit) => ({ value: String(digit), name: String(digit) })),
      { value: '-', name: 'Minus' }, { value: 'blank', name: 'Blank' }, { value: 'custom', name: 'Custom segments' },
    ],
    defaultState: 'blank',
    inputs: [
      { kind: 'number', key: 'brightness', name: 'Brightness', description: 'Lit-segment brightness, including the decimal point.', defaultValue: 1, suggestedLuaName: 'brightness', sourceDomain: '0–1 maps to shades 0–15.', affectedProperties: 'Lit segment shades' },
      { kind: 'number', key: 'offBrightness', name: 'Off brightness', description: 'Unlit-segment brightness; set to zero for a dark background.', defaultValue: 0.1, suggestedLuaName: 'off_brightness', sourceDomain: '0–1 maps to shades 0–15.', affectedProperties: 'Unlit segment shades' },
      { kind: 'boolean', key: 'decimalPoint', name: 'Decimal point', description: 'Independent decimal point, including in the blank state.', defaultValue: false, suggestedLuaName: 'decimal_point', sourceDomain: 'Boolean from script state.', affectedProperties: 'Decimal point visibility' },
      ...segments.map((segment) => ({
        kind: 'boolean' as const, key: `segment${segment.toUpperCase()}`, name: `Segment ${segment.toUpperCase()}`,
        description: `Lights segment ${segment.toUpperCase()} in custom state only (A top, B upper right, C lower right, D bottom, E lower left, F upper left, G middle).`,
        defaultValue: false, suggestedLuaName: `segment_${segment}`, sourceDomain: 'Boolean from script state.', affectedProperties: 'Custom segment visibility',
      })),
    ],
    scenarios: [
      { id: 'default', name: 'Digit 0', state: '0' },
      { id: 'active', name: 'Digit 8 + decimal', state: '8', values: { decimalPoint: true } },
      { id: 'edge', name: 'Minus', state: '-' },
      { id: 'blank', name: 'Blank', state: 'blank' },
      { id: 'custom', name: 'Custom A', state: 'custom', values: { segmentA: true, segmentB: true, segmentC: true, segmentE: true, segmentF: true, segmentG: true } },
    ],
    build: (context, state) => {
      const box = (name: string, coords: readonly number[], lit: boolean, visible: DisplayVisibility = { kind: 'visible' }): DisplayPrimitiveElement => ({
        kind: 'box', id: context.primitiveId(), name, fill: true,
        x1: { kind: 'literal', value: coords[0]! }, y1: { kind: 'literal', value: coords[1]! },
        x2: { kind: 'literal', value: coords[2]! }, y2: { kind: 'literal', value: coords[3]! },
        shade: context.number(lit ? 'brightness' : 'offBrightness', 0, 15), visible,
      })
      const artwork = segments.flatMap((segment, index) => {
        const name = `Segment ${segment.toUpperCase()}`
        const coords = rectangles[index]!
        if (state !== 'custom') return [box(name, coords, (glyphs[state] ?? '').includes(segment))]
        const key = `segment${segment.toUpperCase()}`
        return [box(`${name} off`, coords, false, context.visible(key, true)), box(name, coords, true, context.visible(key))]
      })
      const dot = [width + 1, height - thickness, width + thickness, height - 1]
      artwork.push(box('Decimal point off', dot, false, context.visible('decimalPoint', true)), box('Decimal point', dot, true, context.visible('decimalPoint')))
      return artwork
    },
  }
}

export const SEVEN_SEGMENT_COMPONENTS: readonly DisplayComponentRecipe[] = [
  sevenSegment('Small', 7, 11, 1),
  sevenSegment('Medium', 11, 19, 2),
  sevenSegment('Large', 19, 33, 3),
]
