import { readFileSync } from 'node:fs'
import { createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DisplayDesignerDialog } from './DisplayDesignerDialog'

const designerCss = readFileSync(new URL('./display-designer.css', import.meta.url), 'utf8')

describe('Display designer rendering', () => {
  it('renders a labelled full-size authoring dialog with every static primitive path', () => {
    const markup = renderToStaticMarkup(
      <DisplayDesignerDialog open returnFocusRef={createRef<HTMLElement>()} onClose={() => undefined} />,
    )

    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-modal="true"')
    expect(markup).toContain('aria-labelledby="display-designer-title"')
    expect(markup).toContain('Browser-only authoring for the 256 × 64 Disting NT display.')
    expect(markup).toContain('role="toolbar"')
    for (const label of ['Select', 'Pixel line', 'Smooth line', 'Outline box', 'Filled box', 'Pixel circle', 'Smooth circle', 'Standard text', 'Tiny text']) {
      expect(markup).toContain(`aria-label="${label}"`)
    }
    expect(markup).toContain('Keep standard parameter line')
    expect(markup).toContain('Use full display')
    expect(markup).toContain('aria-label="Display designer pixel preview"')
    expect(markup).toContain('width="256" height="64"')
    expect(markup).toContain('aria-label="Display designer geometry overlay"')
    expect(markup).toContain('Layers')
    expect(markup).toContain('Properties')
    expect(markup).toContain('Findings')
    expect(markup).toContain('Metrics')
    expect(markup).toContain('Generated Lua')
    expect(markup).toContain('aria-label="Generated Lua source"')
    expect(markup).toContain('class="lua-token lua-token--keyword">function</span>')
    expect(markup).toContain('class="lua-token lua-token--builtin">self</span>')
    expect(markup).not.toContain('return true')
  })

  it('pins the desktop regions, collapsible columns, pixel raster, and responsive fill shell', () => {
    expect(designerCss).toMatch(/\.display-designer-workspace \{[^}]*grid-template-columns: minmax\(190px, 17%\) minmax\(360px, 1fr\) minmax\(230px, 20%\)/s)
    expect(designerCss).toContain('.display-designer-workspace.layers-collapsed')
    expect(designerCss).toContain('.display-designer-workspace.inspector-collapsed')
    expect(designerCss).toMatch(/\.display-designer-artboard canvas \{[^}]*image-rendering: pixelated;/s)
    expect(designerCss).toMatch(/@media \(max-width: 720px\)/)
    expect(designerCss).toMatch(/height: 100dvh/)
  })
})
