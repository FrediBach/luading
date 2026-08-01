import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DistingDeviceFace } from './DistingDeviceFace'
import { DraggableDisplayPreview } from './DraggableDisplayPreview'
import { clampDisplayPosition } from './display-position'
import { HardwareControlBank } from './HardwareControlBank'

describe('Disting device face rendering', () => {
  it('renders all typed physical controls with accessible names', () => {
    const markup = renderToStaticMarkup(
      <HardwareControlBank
        potPositions={[0.25, 0.5, 0.75]}
        activeControls={[
          'pot1',
          'pot2',
          'pot3',
          'encoder1',
          'encoder2',
          'button1',
          'button2',
          'button3',
          'button4',
        ]}
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

  it('renders only the hardware controls used by the script', () => {
    const markup = renderToStaticMarkup(
      <HardwareControlBank
        potPositions={[0.25, 0.5, 0.75]}
        activeControls={['pot2', 'encoder1', 'button4']}
        onPotTurn={() => undefined}
        onEncoderTurn={() => undefined}
        onControlPress={() => undefined}
        onControlRelease={() => undefined}
      />,
    )

    expect(markup).toContain('1 pot · 1 encoder · 1 button')
    expect(markup).toContain('>Pot 2</span>')
    expect(markup).toContain('>Encoder 1</span>')
    expect(markup).toContain('aria-label="Button 4"')
    expect(markup).not.toContain('>Pot 1</span>')
    expect(markup).not.toContain('>Encoder 2</span>')
    expect(markup).not.toContain('aria-label="Button 1"')
  })

  it('renders an informative empty state when the script uses no controls', () => {
    const markup = renderToStaticMarkup(
      <HardwareControlBank
        potPositions={[0.5, 0.5, 0.5]}
        activeControls={[]}
        onPotTurn={() => undefined}
        onEncoderTurn={() => undefined}
        onControlPress={() => undefined}
        onControlRelease={() => undefined}
      />,
    )

    expect(markup).toContain('0 script controls')
    expect(markup).toContain('No hardware controls used')
    expect(markup).toContain('pot1Turn()')
    expect(markup).not.toContain('role="slider"')
    expect(markup).not.toContain('aria-roledescription="endless encoder"')
    expect(markup).not.toContain('aria-label="Hardware buttons"')
  })

  it('renders the display as a separate draggable preview', () => {
    const markup = renderToStaticMarkup(
      <DraggableDisplayPreview
        commands={[]}
      />,
    )

    expect(markup).toContain('aria-label="Draggable Disting NT display preview"')
    expect(markup).toContain('Move display preview. Use arrow keys or drag.')
    expect(markup).toContain('<header class="draggable-display-header">')
    expect(markup).toContain('role="switch" aria-label="Render display at 2x" aria-checked="false"')
    expect(markup).not.toContain('is-floating')
    expect(markup).not.toContain('>Dock</button>')
    expect(markup).not.toContain('<output')
  })

  it('disables hardware controls when no script is loaded', () => {
    const markup = renderToStaticMarkup(
      <DistingDeviceFace
        potPositions={[0.5, 0.5, 0.5]}
        activeControls={['pot1']}
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
})
