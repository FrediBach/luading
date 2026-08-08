import { readFileSync } from 'node:fs'
import { createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DisplayDesignerDialog } from './DisplayDesignerDialog'

const designerCss = readFileSync(new URL('./display-designer.css', import.meta.url), 'utf8')
const distingCss = readFileSync(new URL('../../DistingPlayground.css', import.meta.url), 'utf8')
const workbenchCss = readFileSync(new URL('../workbench.css', import.meta.url), 'utf8')
const rootCss = readFileSync(new URL('../../../index.css', import.meta.url), 'utf8')

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
    for (const label of ['Select', 'Pixel line', 'Smooth line', 'Outline box', 'Filled box', 'Pixel box', 'Pixel circle', 'Smooth circle', 'Polygon', 'Standard text', 'Tiny text']) {
      expect(markup).toContain(`aria-label="${label}"`)
    }
    expect(markup).toContain('Keep standard parameter line')
    expect(markup).toContain('Use full display')
    expect(markup).toContain('aria-label="Display designer pixel preview"')
    expect(markup).toContain('width="256" height="64"')
    expect(markup).toContain('aria-label="Display designer geometry overlay"')
    expect(markup).toContain('View options')
    expect(markup).toContain('Artboard')
    expect(markup).toContain('Add layout grid')
    expect(markup).toContain('Layers')
    expect(markup).toContain('Properties')
    expect(markup).toContain('Tokens')
    expect(markup).toContain('Findings')
    expect(markup).toContain('Metrics')
    expect(markup).toContain('Generated Lua')
    expect(markup).toContain('aria-label="Generated Lua source"')
    expect(markup).toContain('class="lua-token lua-token--keyword">function</span>')
    expect(markup).toContain('class="lua-token lua-token--builtin">self</span>')
    expect(markup).not.toContain('return true')
  })

  it('pins the desktop regions, collapsible columns, pixel raster, and responsive fill shell', () => {
    expect(designerCss).toMatch(/\.display-designer-title h2 \{[^}]*color: var\(--nt-text\);/s)
    expect(designerCss).toMatch(/\.display-designer-source pre \{[^}]*font: var\(--font-micro\)\/1\.45 var\(--mono\);/s)
    expect(designerCss).toMatch(/\.display-designer-copy-fallback textarea \{[^}]*font: var\(--font-micro\)\/1\.45 var\(--mono\);/s)
    expect(designerCss).toMatch(/\.display-designer-token-card > header strong \{[^}]*font: 700 var\(--font-label\)\/1\.2 var\(--mono\);/s)
    expect(designerCss).toMatch(/\.display-designer-token-card > header code,\s*\.display-designer-token-card > details > summary \{[^}]*font: var\(--font-micro\)\/1\.3 var\(--mono\);/s)
    expect(designerCss).toMatch(/\.display-designer-context-menu \{[^}]*position: fixed;[^}]*z-index: 260;/s)
    expect(designerCss).toContain('.display-designer-layers > h3:not(:first-child) { margin-top: 12px; }')
    expect(designerCss).toMatch(/\.display-designer-symbols \{[^}]*margin-top: 10px;[^}]*padding-top: 12px;/s)
    expect(designerCss).toMatch(/\.display-designer-workspace \{[^}]*grid-template-columns: minmax\(190px, 17%\) minmax\(360px, 1fr\) minmax\(230px, 20%\)/s)
    expect(designerCss).toContain('.display-designer-workspace.layers-collapsed')
    expect(designerCss).toContain('.display-designer-workspace.inspector-collapsed')
    expect(designerCss).toMatch(/\.display-designer-artboard canvas \{[^}]*image-rendering: pixelated;/s)
    expect(designerCss).toMatch(/\.display-designer-artboard\.has-pixel-grid::after/)
    expect(designerCss).toMatch(/\.display-designer-layout-grid \{[^}]*vector-effect: non-scaling-stroke;/s)
    expect(designerCss).toMatch(/\.display-designer-snap-guides \{[^}]*stroke-width: 1\.5px;[^}]*vector-effect: non-scaling-stroke;/s)
    expect(designerCss).toMatch(/\.display-designer-view-menu \{[^}]*z-index: 250;/s)
    expect(designerCss).toMatch(/\.display-designer-dynamic-actions > select \{[^}]*min-height: 30px;[^}]*border: 1px solid var\(--nt-line\);[^}]*background: var\(--surface-recessed\);/s)
    expect(designerCss).toMatch(/@media \(max-width: 720px\)/)
    expect(designerCss).toMatch(/height: 100dvh/)
  })

  it('server-renders linked, roving panel tabs for medium and narrow layouts', () => {
    const medium = renderToStaticMarkup(
      <DisplayDesignerDialog open viewportWidth={800} returnFocusRef={createRef<HTMLElement>()} onClose={() => undefined} />,
    )
    expect(medium).toContain('class="display-designer-dialog is-medium"')
    expect(medium).toContain('role="tablist" aria-label="Display designer panels"')
    expect(medium).toContain('id="display-designer-tab-layers"')
    expect(medium).toContain('aria-selected="true" aria-controls="display-designer-panel-layers" tabindex="0"')
    expect(medium).toContain('id="display-designer-tab-symbols"')
    expect(medium).toContain('id="display-designer-tab-tokens"')
    expect(medium).toContain('aria-selected="false" aria-controls="display-designer-panel-symbols" tabindex="-1"')
    expect(medium).toContain('role="tabpanel" id="display-designer-panel-layers" aria-labelledby="display-designer-tab-layers"')
    expect(medium).toContain('id="display-designer-panel-properties" aria-labelledby="display-designer-tab-properties" hidden=""')

    const narrow = renderToStaticMarkup(
      <DisplayDesignerDialog open viewportWidth={720} returnFocusRef={createRef<HTMLElement>()} onClose={() => undefined} />,
    )
    expect(narrow).toContain('class="display-designer-dialog is-narrow"')
    expect(narrow).toContain('aria-label="Artboard zoom" disabled="" title="Narrow layouts use Fit zoom"')
    expect(narrow).toContain('data-zoom="fit"')
  })

  it('exposes non-colour states, disclosures, announcements, touch targets, and reduced motion', () => {
    const markup = renderToStaticMarkup(
      <DisplayDesignerDialog open returnFocusRef={createRef<HTMLElement>()} onClose={() => undefined} />,
    )
    expect(markup).toContain('role="note"')
    expect(markup).toContain('Browser-only extension')
    expect(markup).toContain('smooth rasterization remains an approximate preview')
    expect(markup).toContain('role="status" aria-live="polite" aria-atomic="true"')
    expect(markup).toContain('aria-pressed="true"')
    expect(designerCss).toMatch(/@media \(pointer: coarse\)[\s\S]*?min-height: 44px/)
    expect(designerCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation-duration: 0\.01ms !important/)
    expect(designerCss).toMatch(/@media \(max-width: 900px\)[\s\S]*?grid-template-rows: auto auto auto minmax\(190px, 1fr\) auto minmax\(180px, 35%\)/)
  })

  it('references only variables declared by the inherited app theme or the designer itself', () => {
    const references = new Set([...designerCss.matchAll(/var\((--[A-Za-z0-9_-]+)/g)].map((match) => match[1]))
    const declarations = new Set(
      [...`${rootCss}\n${distingCss}\n${workbenchCss}\n${designerCss}`.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)]
        .map((match) => match[1]),
    )
    // Each shade button sets this custom property through its React style.
    declarations.add('--shade')

    expect([...references].filter((variable) => !declarations.has(variable))).toEqual([])
  })
})
