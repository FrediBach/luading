import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SignalShape } from '../types'
import { ControlPopover } from './ControlPopover'
import { ControlTile } from './ControlTile'
import { IconToggle } from './IconToggle'
import { MiniSignalPlot } from './MiniSignalPlot'
import { MomentaryButton } from './MomentaryButton'
import { RotaryControl } from './RotaryControl'
import { SignalShapeGlyph } from './SignalShapeGlyph'

describe('custom control rendering', () => {
  it('positions popovers in the viewport by default to escape clipped panels', () => {
    const markup = renderToStaticMarkup(
      <ControlPopover
        open
        label="Overflow-safe menu"
        onClose={() => undefined}
      >
        <button type="button">Option</button>
      </ControlPopover>,
    )

    expect(markup).toContain('control-popover control-popover--viewport')
    expect(markup).toContain('aria-label="Overflow-safe menu"')
  })

  it('exposes rotary values as an accessible slider and exact value button', () => {
    const markup = renderToStaticMarkup(
      <RotaryControl
        label="Frequency"
        value={2.5}
        min={0}
        max={10}
        step={0.1}
        unit="Hz"
        onChange={() => undefined}
      />,
    )

    expect(markup).toContain('role="slider"')
    expect(markup).toContain('aria-valuenow="2.5"')
    expect(markup).toContain('aria-valuetext="2.50 Hz"')
    expect(markup).toContain('Edit exact value')
  })

  it('renders toggle and momentary state with pressed semantics', () => {
    const markup = renderToStaticMarkup(
      <>
        <IconToggle
          icon="sync"
          label="Clock sync"
          pressed
          onChange={() => undefined}
        />
        <MomentaryButton
          label="Fire trigger"
          onPress={() => undefined}
          onRelease={() => undefined}
        />
      </>,
    )

    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('aria-label="Fire trigger"')
    expect(markup).toContain('aria-pressed="false"')
  })

  it('gives activatable tiles keyboard button semantics', () => {
    const markup = renderToStaticMarkup(
      <ControlTile
        label="Input 1"
        meta="CV"
        visual={<span>trace</span>}
        value={<output>1.25 V</output>}
        onActivate={() => undefined}
      />,
    )

    expect(markup).toContain('role="button"')
    expect(markup).toContain('tabindex="0"')
    expect(markup).toContain('Open Input 1 settings')
  })

  it('advertises a custom context menu when one is available', () => {
    const markup = renderToStaticMarkup(
      <ControlTile
        label="Input 1"
        visual={<span>trace</span>}
        value={<output>0 V</output>}
        onContextMenu={() => undefined}
      />,
    )

    expect(markup).toContain('aria-haspopup="menu"')
  })

  it('renders every signal glyph and a labelled sampled plot', () => {
    const shapes: SignalShape[] = [
      'manual',
      'sine',
      'triangle',
      'sawUp',
      'sawDown',
      'square',
      'gate',
      'trigger',
      'gateSequencer',
      'noteSequencer',
      'arpeggio',
      'sampleHold',
      'noise',
    ]
    const glyphs = renderToStaticMarkup(
      <>{shapes.map((shape) => <SignalShapeGlyph shape={shape} key={shape} />)}</>,
    )
    const plot = renderToStaticMarkup(
      <MiniSignalPlot
        label="Input 1 voltage"
        values={[0, 1, 0, -1, 0]}
        min={-1}
        max={1}
      />,
    )

    expect(glyphs.match(/signal-shape-glyph/g)).toHaveLength(shapes.length)
    expect(plot).toContain('aria-label="Input 1 voltage"')
    expect(plot).toContain('mini-signal-path')
  })
})
