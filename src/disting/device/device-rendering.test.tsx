import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DistingDeviceFace } from './DistingDeviceFace'
import { DraggableDisplayPreview } from './DraggableDisplayPreview'
import {
  clampDisplayPosition,
  positionDisplayAtBottomRight,
} from './display-position'
import { HardwareControlBank } from './HardwareControlBank'

describe('Disting device face rendering', () => {
  const anchorRef = { current: null }

  it('renders all typed physical controls with accessible names', () => {
    const markup = renderToStaticMarkup(
      <HardwareControlBank
        potPositions={[0.25, 0.5, 0.75]}
        onPotTurn={() => undefined}
        onEncoderTurn={() => undefined}
        onControlPress={() => undefined}
        onControlRelease={() => undefined}
      />,
    )

    expect(markup).toContain('<small>Hardware</small>')
    expect(markup).toContain('3 pots · 2 encoders · 4 buttons')
    expect(markup.match(/role="slider"/g)).toHaveLength(3)
    expect(markup.match(/aria-roledescription="endless encoder"/g)).toHaveLength(2)
    expect(markup).toContain('aria-label="Pot 1 push"')
    expect(markup).toContain('aria-label="Encoder 2 push"')
    expect(markup).toContain('aria-label="Button 4"')
  })

  it('renders the display as a separate draggable preview', () => {
    const markup = renderToStaticMarkup(
      <DraggableDisplayPreview
        commands={[]}
        anchorRef={anchorRef}
      />,
    )

    expect(markup).toContain('aria-label="Draggable Disting NT display preview"')
    expect(markup).toContain('Move display preview. Use arrow keys or drag.')
    expect(markup).toContain('<header class="draggable-display-header">')
    expect(markup).toContain('role="switch" aria-label="Render display at 2x" aria-checked="false"')
    expect(markup).not.toContain('<output')
  })

  it('disables hardware controls when no script is loaded', () => {
    const markup = renderToStaticMarkup(
      <DistingDeviceFace
        potPositions={[0.5, 0.5, 0.5]}
        disabled
        onPotTurn={() => undefined}
        onEncoderTurn={() => undefined}
        onControlPress={() => undefined}
        onControlRelease={() => undefined}
      />,
    )

    expect(markup).toContain('disabled=""')
  })

  it('keeps a dragged display preview within the viewport', () => {
    expect(clampDisplayPosition(
      { x: -100, y: 700 },
      { width: 294, height: 150 },
      { width: 1000, height: 600 },
      8,
    )).toEqual({ x: 8, y: 442 })
  })

  it('insets the initial display position from the code panel bottom right', () => {
    expect(positionDisplayAtBottomRight(
      { right: 720, bottom: 600 },
      { width: 294, height: 124 },
      12,
    )).toEqual({ x: 414, y: 464 })
  })
})
