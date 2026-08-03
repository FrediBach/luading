import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ParameterDefinition } from '../types'
import { ParameterBank } from './ParameterBank'
import { ParameterControl } from './ParameterControl'

function parameter(
  name: string,
  update: Partial<ParameterDefinition> = {},
): ParameterDefinition {
  return {
    name,
    min: 0,
    max: 100,
    value: 50,
    unit: '%',
    scale: 1,
    ...update,
  }
}

describe('parameter control rendering', () => {
  it('renders scaled and bipolar values as accessible rotary sliders', () => {
    const scaled = renderToStaticMarkup(
      <ParameterControl
        definition={parameter('Rate', {
          min: 0.05,
          max: 5,
          value: 1,
          unit: 'Hz',
          scale: 100,
        })}
        value={1.25}
        onChange={() => undefined}
      />,
    )
    const bipolar = renderToStaticMarkup(
      <ParameterControl
        definition={parameter('Offset', {
          min: -5,
          max: 5,
          value: 0,
          unit: 'V',
          scale: 10,
        })}
        value={-1.5}
        onChange={() => undefined}
      />,
    )

    expect(scaled).toContain('data-control-kind="continuous"')
    expect(scaled).toContain('aria-valuetext="1.25 Hz"')
    expect(bipolar).toContain('data-control-kind="bipolar"')
    expect(bipolar).toContain('aria-valuetext="-1.5 V"')
  })

  it('renders short enums as 1-based segmented controls', () => {
    const markup = renderToStaticMarkup(
      <ParameterControl
        definition={parameter('Mode', {
          min: 1,
          max: 3,
          value: 1,
          unit: '',
          enumValues: ['Off', 'Gate', 'Latch'],
        })}
        value={2}
        onChange={() => undefined}
      />,
    )

    expect(markup).toContain('data-control-kind="enum-segmented"')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('>Gate<')
  })

  it('renders long enums as a custom menu trigger', () => {
    const markup = renderToStaticMarkup(
      <ParameterControl
        definition={parameter('Scale', {
          min: 1,
          max: 6,
          value: 1,
          unit: '',
          enumValues: ['Major', 'Minor', 'Dorian', 'Mixolydian', 'Whole tone', 'Chromatic'],
        })}
        value={4}
        onChange={() => undefined}
      />,
    )

    expect(markup).toContain('data-control-kind="enum-menu"')
    expect(markup).toContain('aria-haspopup="dialog"')
    expect(markup).toContain('Mixolydian')
    expect(markup).toContain('4 / 6')
  })

  it('shows only one compact parameter page at a time', () => {
    const definitions = Array.from(
      { length: 10 },
      (_, index) => parameter(`Parameter ${index + 1}`),
    )
    const markup = renderToStaticMarkup(
      <ParameterBank
        definitions={definitions}
        values={definitions.map((definition) => definition.value)}
        onChange={() => undefined}
      />,
    )

    expect(markup.match(/role="slider"/g)).toHaveLength(8)
    expect(markup).toContain('1–8 of 10')
    expect(markup).toContain('1 / 2')
    expect(markup).toContain('aria-label="Next parameter page"')
  })

  it('keeps an informative parameter panel when none are defined', () => {
    const markup = renderToStaticMarkup(
      <ParameterBank
        definitions={[]}
        values={[]}
        onChange={() => undefined}
      />,
    )

    expect(markup).toContain('aria-label="Script parameters"')
    expect(markup).toContain('0 defined')
    expect(markup).toContain('No parameters')
    expect(markup).toContain(
      'Add parameters to the script&#x27;s init configuration',
    )
    expect(markup).not.toContain('role="slider"')
  })

  it('renders ordered simulator-only presets and derives active or custom state', () => {
    const definitions = [parameter('Rate'), parameter('Depth')]
    const presets = [
      { name: 'Subtle', values: [25, 20] },
      { name: 'Wide', values: [80, 100] },
    ]
    const active = renderToStaticMarkup(
      <ParameterBank
        definitions={definitions}
        values={[80, 100]}
        presets={presets}
        onChange={() => undefined}
        onApplyPreset={() => undefined}
      />,
    )
    const custom = renderToStaticMarkup(
      <ParameterBank
        definitions={definitions}
        values={[50, 50]}
        presets={presets}
        presetsDisabled
        onChange={() => undefined}
        onApplyPreset={() => undefined}
      />,
    )

    expect(active).toContain('aria-label="Parameter preset"')
    expect(active).not.toContain('>Parameter preset<')
    expect(active).not.toContain('>Simulator<')
    expect(active.indexOf('Subtle')).toBeLessThan(active.indexOf('Wide'))
    expect(active).toContain('<option value="1" selected="">Wide</option>')
    expect(active).not.toContain('ignored by Disting NT hardware')
    expect(custom).toContain('<option value="" disabled="" selected="">Custom</option>')
    expect(custom).toContain('<select disabled=""')
  })

  it('does not show a preset selector unless valid presets and a handler exist', () => {
    const definitions = [parameter('Rate')]
    const withoutPresets = renderToStaticMarkup(
      <ParameterBank
        definitions={definitions}
        values={[50]}
        onChange={() => undefined}
        onApplyPreset={() => undefined}
      />,
    )
    const withoutHandler = renderToStaticMarkup(
      <ParameterBank
        definitions={definitions}
        values={[50]}
        presets={[{ name: 'Default', values: [50] }]}
        onChange={() => undefined}
      />,
    )

    expect(withoutPresets).not.toContain('Parameter preset')
    expect(withoutHandler).not.toContain('Parameter preset')
  })
})
