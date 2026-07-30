interface DrawerPanelSnapshot {
  id: string
  active: boolean
  content: unknown
}

export function shouldReuseDrawerPanel(
  previous: DrawerPanelSnapshot,
  next: DrawerPanelSnapshot,
) {
  if (previous.id !== next.id) return false
  if (!previous.active && !next.active) return true
  return previous.active === next.active && previous.content === next.content
}
