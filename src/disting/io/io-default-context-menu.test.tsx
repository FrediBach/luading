import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { IoDefaultContextMenu } from './IoDefaultContextMenu'

describe('I/O default context menu', () => {
  it('previews and offers a paste-ready Lua entry', () => {
    const markup = renderToStaticMarkup(
      <IoDefaultContextMenu
        label="IN 1 · Clock"
        point={{ x: 20, y: 30 }}
        entry="kCV, -- Type: Gate, Synced: true, Division: 1/4"
        onClose={() => undefined}
      />,
    )

    expect(markup).toContain('role="menu"')
    expect(markup).toContain('IN 1 · Clock Lua default')
    expect(markup).toContain('kCV, -- Type: Gate, Synced: true, Division: 1/4')
    expect(markup).toContain('role="menuitem"')
    expect(markup).toContain('Copy Lua entry')
  })

  it('explains and disables copying for unsupported browser routes', () => {
    const markup = renderToStaticMarkup(
      <IoDefaultContextMenu
        label="OUT 1 · MIDI"
        point={{ x: 20, y: 30 }}
        entry={null}
        unavailableReason="Web MIDI routes cannot be copied."
        onClose={() => undefined}
      />,
    )

    expect(markup).toContain('Web MIDI routes cannot be copied.')
    expect(markup).toContain('disabled=""')
  })
})
