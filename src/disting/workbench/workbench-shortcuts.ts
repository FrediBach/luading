import { useEffect, useEffectEvent } from 'react'
import type { DrawerTabId, WorkspacePresetId } from './workbench-layout'

export type WorkbenchShortcutCommand =
  | { type: 'run' }
  | { type: 'toggleRuntime' }
  | { type: 'toggleDrawer'; tab: DrawerTabId }
  | { type: 'applyPreset'; preset: WorkspacePresetId }

interface ShortcutKey {
  key: string
  code: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  repeat?: boolean
  defaultPrevented?: boolean
}

const DRAWER_TABS: DrawerTabId[] = [
  'scope',
  'problems',
  'console',
  'performance',
]
const WORKSPACE_PRESETS: WorkspacePresetId[] = [
  'code',
  'patch',
  'monitor',
  'compact',
]

interface ShortcutHint {
  aria: string
  label: string
}

export const DRAWER_SHORTCUTS: Record<DrawerTabId, ShortcutHint> = {
  scope: {
    aria: 'Control+Alt+Shift+1 Meta+Alt+Shift+1',
    label: '⌘/Ctrl+Alt+Shift+1',
  },
  problems: {
    aria: 'Control+Alt+Shift+2 Meta+Alt+Shift+2',
    label: '⌘/Ctrl+Alt+Shift+2',
  },
  console: {
    aria: 'Control+Alt+Shift+3 Meta+Alt+Shift+3',
    label: '⌘/Ctrl+Alt+Shift+3',
  },
  performance: {
    aria: 'Control+Alt+Shift+4 Meta+Alt+Shift+4',
    label: '⌘/Ctrl+Alt+Shift+4',
  },
}

export const WORKSPACE_PRESET_SHORTCUTS: Record<
  WorkspacePresetId,
  ShortcutHint
> = {
  code: { aria: 'Control+Alt+1 Meta+Alt+1', label: '⌘/Ctrl+Alt+1' },
  patch: { aria: 'Control+Alt+2 Meta+Alt+2', label: '⌘/Ctrl+Alt+2' },
  monitor: { aria: 'Control+Alt+3 Meta+Alt+3', label: '⌘/Ctrl+Alt+3' },
  compact: { aria: 'Control+Alt+4 Meta+Alt+4', label: '⌘/Ctrl+Alt+4' },
}

function digitIndex(code: string) {
  const match = /^Digit([1-4])$/.exec(code)
  return match ? Number(match[1]) - 1 : -1
}

export function resolveWorkbenchShortcut(
  event: ShortcutKey,
  editableTarget: boolean,
): WorkbenchShortcutCommand | null {
  if (event.repeat || event.defaultPrevented) return null

  const commandModifier = event.ctrlKey || event.metaKey
  if (
    commandModifier
    && !event.altKey
    && !event.shiftKey
    && event.key === 'Enter'
  ) {
    return { type: 'run' }
  }

  if (
    commandModifier
    && event.altKey
    && !event.shiftKey
    && event.code === 'KeyP'
  ) {
    return { type: 'toggleRuntime' }
  }

  if (commandModifier && event.altKey) {
    const index = digitIndex(event.code)
    if (index < 0) return null
    return event.shiftKey
      ? { type: 'toggleDrawer', tab: DRAWER_TABS[index] }
      : { type: 'applyPreset', preset: WORKSPACE_PRESETS[index] }
  }

  if (editableTarget) return null

  return null
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || Boolean(target.closest(
    'input, textarea, select, [contenteditable="true"], .monaco-editor',
  ))
}

interface WorkbenchShortcutHandlers {
  canToggleRunning: boolean
  onRun(): void
  onToggleRunning(): void
  onToggleDrawer(tab: DrawerTabId): void
  onApplyPreset(preset: WorkspacePresetId): void
}

export function useWorkbenchShortcuts({
  canToggleRunning,
  onRun,
  onToggleRunning,
  onToggleDrawer,
  onApplyPreset,
}: WorkbenchShortcutHandlers) {
  const handleShortcut = useEffectEvent((event: KeyboardEvent) => {
    const command = resolveWorkbenchShortcut(
      event,
      isEditableTarget(event.target),
    )
    if (!command) return
    if (command.type === 'toggleRuntime' && !canToggleRunning) return

    event.preventDefault()
    event.stopPropagation()

    switch (command.type) {
      case 'run':
        onRun()
        break
      case 'toggleRuntime':
        onToggleRunning()
        break
      case 'toggleDrawer':
        onToggleDrawer(command.tab)
        break
      case 'applyPreset':
        onApplyPreset(command.preset)
        break
    }
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleShortcut(event)
    window.addEventListener('keydown', listener, true)
    return () => window.removeEventListener('keydown', listener, true)
  }, [])
}
