import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { BottomDrawer } from './BottomDrawer'
import { SplitPane } from './SplitPane'

describe('responsive workbench rendering', () => {
  it('exposes Editor and Instrument as linked tabs below 900 px', () => {
    const markup = renderToStaticMarkup(
      <SplitPane
        primary={<p>Editor content</p>}
        secondary={<p>Instrument content</p>}
        splitPercent={60}
        narrow
        responsiveMode="instrument"
        onSplitChange={vi.fn()}
        onSplitReset={vi.fn()}
        onResponsiveModeChange={vi.fn()}
      />,
    )

    expect(markup).toContain('role="tablist"')
    expect(markup).toContain('id="workbench-responsive-tab-editor"')
    expect(markup).toContain('aria-selected="true" tabindex="0">Instrument')
    expect(markup).toContain('id="workbench-responsive-panel-editor"')
    expect(markup).toContain('aria-labelledby="workbench-responsive-tab-editor" hidden=""')
    expect(markup).toContain('role="tabpanel" aria-labelledby="workbench-responsive-tab-instrument"')
  })

  it('keeps both labelled regions available in the desktop split', () => {
    const markup = renderToStaticMarkup(
      <SplitPane
        primary={<p>Editor content</p>}
        secondary={<p>Instrument content</p>}
        splitPercent={60}
        narrow={false}
        responsiveMode="editor"
        onSplitChange={vi.fn()}
        onSplitReset={vi.fn()}
        onResponsiveModeChange={vi.fn()}
      />,
    )

    expect(markup).toContain('aria-label="Lua editor"')
    expect(markup).toContain('aria-label="Disting instrument"')
    expect(markup).not.toContain('hidden=""')
  })

  it('links drawer tabs and panels with one roving tab stop', () => {
    const markup = renderToStaticMarkup(
      <BottomDrawer
        activeTab="console"
        open
        height={220}
        onToggleTab={vi.fn()}
        onHeightChange={vi.fn()}
        tabs={[
          { id: 'scope', label: 'Scope', content: <p>Scope content</p> },
          { id: 'console', label: 'Console', content: <p>Console content</p> },
        ]}
      />,
    )

    expect(markup).toContain('id="workbench-drawer-tab-scope"')
    expect(markup).toContain('aria-selected="false"')
    expect(markup).toContain('tabindex="-1"')
    expect(markup).toContain('id="workbench-drawer-tab-console"')
    expect(markup).toContain('aria-selected="true"')
    expect(markup).toContain('aria-expanded="true"')
    expect(markup).toContain('aria-labelledby="workbench-drawer-tab-console"')
  })
})
