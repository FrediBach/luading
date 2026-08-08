import { describe, expect, it } from 'vitest'
import {
  DISPLAY_DESIGNER_PANELS,
  displayDesignerLayoutForWidth,
  moveDisplayDesignerTab,
} from './display-designer-layout'

describe('Display designer responsive layout', () => {
  it('uses the documented wide, medium, and narrow width boundaries', () => {
    expect(displayDesignerLayoutForWidth(1440)).toBe('wide')
    expect(displayDesignerLayoutForWidth(901)).toBe('wide')
    expect(displayDesignerLayoutForWidth(900)).toBe('medium')
    expect(displayDesignerLayoutForWidth(721)).toBe('medium')
    expect(displayDesignerLayoutForWidth(720)).toBe('narrow')
    expect(displayDesignerLayoutForWidth(320)).toBe('narrow')
  })

  it('keeps every responsive authoring region in stable tab order', () => {
    expect(DISPLAY_DESIGNER_PANELS).toEqual([
      { id: 'layers', label: 'Layers' },
      { id: 'symbols', label: 'Symbols' },
      { id: 'properties', label: 'Properties' },
      { id: 'tokens', label: 'Tokens' },
      { id: 'state', label: 'State' },
      { id: 'findings', label: 'Findings' },
      { id: 'metrics', label: 'Metrics' },
      { id: 'lua', label: 'Lua' },
    ])
  })

  it('wraps arrow navigation and supports Home and End', () => {
    expect(moveDisplayDesignerTab(0, 'ArrowLeft', 4)).toBe(3)
    expect(moveDisplayDesignerTab(3, 'ArrowRight', 4)).toBe(0)
    expect(moveDisplayDesignerTab(2, 'Home', 4)).toBe(0)
    expect(moveDisplayDesignerTab(1, 'End', 4)).toBe(3)
    expect(moveDisplayDesignerTab(0, 'ArrowRight', 0)).toBe(0)
  })
})
