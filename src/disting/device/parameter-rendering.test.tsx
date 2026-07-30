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
})

