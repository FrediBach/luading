import { useRef, useState } from 'react'
import { ControlIcon, type ControlIconName } from '../controls/ControlIcon'
import { ControlPopover } from '../controls/ControlPopover'
import type { WorkspacePresetId } from './workbench-layout'
import { WORKSPACE_PRESET_SHORTCUTS } from './workbench-shortcuts'

interface Props {
  activePreset: WorkspacePresetId | null
  onApply(preset: WorkspacePresetId): void
}

const PRESETS: Array<{
  id: WorkspacePresetId
  label: string
  description: string
  icon: ControlIconName
}> = [
  {
    id: 'code',
    label: 'Code',
    description: 'Editor dominant; tools collapsed',
    icon: 'code',
  },
  {
    id: 'patch',
    label: 'Patch',
    description: 'Balanced editor, instrument, and tools',
    icon: 'patch',
  },
  {
    id: 'monitor',
    label: 'Monitor',
    description: 'Instrument and scope dominant',
    icon: 'monitor',
  },
  {
    id: 'compact',
    label: 'Compact',
    description: 'Maximum control density',
    icon: 'compact',
  },
]

export function WorkspacePresetMenu({ activePreset, onApply }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const activeLabel = PRESETS.find((preset) => preset.id === activePreset)?.label

  return (
    <div className="commandbar-popover-shell workspace-preset-menu">
      <button
        ref={triggerRef}
        type="button"
        className="commandbar-icon-command"
        aria-label={`Workspace preset: ${activeLabel ?? 'Custom'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ControlIcon name={activePreset ?? 'patch'} size={15} />
        <span>{activeLabel ?? 'Custom'}</span>
      </button>
      <ControlPopover
        open={open}
        label="Workspace presets"
        anchorRef={triggerRef}
        onClose={() => setOpen(false)}
      >
        <div className="workspace-preset-options">
          {PRESETS.map((preset) => (
            <button
              type="button"
              className={preset.id === activePreset ? 'is-active' : ''}
              aria-pressed={preset.id === activePreset}
              aria-keyshortcuts={WORKSPACE_PRESET_SHORTCUTS[preset.id].aria}
              onClick={() => {
                onApply(preset.id)
                setOpen(false)
              }}
              key={preset.id}
            >
              <ControlIcon name={preset.icon} />
              <span>
                <strong>{preset.label}</strong>
                <small>{preset.description}</small>
              </span>
              <kbd>{WORKSPACE_PRESET_SHORTCUTS[preset.id].label}</kbd>
            </button>
          ))}
        </div>
        <p className="commandbar-popover-note">
          Presets change layout only. Script and simulator state are untouched.
        </p>
      </ControlPopover>
    </div>
  )
}
