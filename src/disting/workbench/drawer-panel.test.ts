import { describe, expect, it } from 'vitest'
import { shouldReuseDrawerPanel } from './drawer-panel'

describe('drawer panel frame isolation', () => {
  it('reuses inactive panels even when live content receives new props', () => {
    expect(shouldReuseDrawerPanel(
      { id: 'scope', active: false, content: { frame: 1 } },
      { id: 'scope', active: false, content: { frame: 2 } },
    )).toBe(true)
  })

  it('updates panels when visibility changes or active content changes', () => {
    const content = { frame: 1 }

    expect(shouldReuseDrawerPanel(
      { id: 'scope', active: false, content },
      { id: 'scope', active: true, content },
    )).toBe(false)
    expect(shouldReuseDrawerPanel(
      { id: 'scope', active: true, content },
      { id: 'scope', active: true, content: { frame: 2 } },
    )).toBe(false)
  })
})
