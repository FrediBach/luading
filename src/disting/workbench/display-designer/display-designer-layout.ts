export const DISPLAY_DESIGNER_MEDIUM_MAX_WIDTH = 900
export const DISPLAY_DESIGNER_NARROW_MAX_WIDTH = 720

export type DisplayDesignerLayoutMode = 'wide' | 'medium' | 'narrow'

export type DisplayDesignerPanel =
  | 'layers'
  | 'components'
  | 'symbols'
  | 'properties'
  | 'tokens'
  | 'state'
  | 'findings'
  | 'metrics'
  | 'lua'

export const DISPLAY_DESIGNER_PANELS: ReadonlyArray<{
  id: DisplayDesignerPanel
  label: string
}> = [
  { id: 'layers', label: 'Layers' },
  { id: 'components', label: 'Components' },
  { id: 'symbols', label: 'Symbols' },
  { id: 'properties', label: 'Properties' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'state', label: 'State' },
  { id: 'findings', label: 'Findings' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'lua', label: 'Lua' },
]

export function displayDesignerLayoutForWidth(width: number): DisplayDesignerLayoutMode {
  if (width <= DISPLAY_DESIGNER_NARROW_MAX_WIDTH) return 'narrow'
  if (width <= DISPLAY_DESIGNER_MEDIUM_MAX_WIDTH) return 'medium'
  return 'wide'
}

export function moveDisplayDesignerTab(
  current: number,
  key: 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End',
  length: number,
): number {
  if (length <= 0) return 0
  if (key === 'Home') return 0
  if (key === 'End') return length - 1
  const delta = key === 'ArrowLeft' ? -1 : 1
  return (current + delta + length) % length
}
