import { useRef, useState } from 'react'
import {
  TEXT_SIZE_OPTIONS,
  type TextSize,
} from '../appearance'
import { ControlPopover } from '../controls/ControlPopover'

interface Props {
  textSize: TextSize
  onChange(textSize: TextSize): void
}

export function AppearancePopover({ textSize, onChange }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const active = TEXT_SIZE_OPTIONS.find((option) => option.id === textSize)

  return (
    <div className="commandbar-popover-shell appearance-popover">
      <button
        ref={triggerRef}
        type="button"
        className="commandbar-icon-command appearance-popover-trigger"
        aria-label={`Text size: ${active?.label ?? 'Standard'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">Aa</span>
      </button>
      <ControlPopover
        open={open}
        label="Text size"
        anchorRef={triggerRef}
        positioning="viewport"
        preferredWidth={360}
        onClose={() => setOpen(false)}
      >
        <div className="appearance-size-options" role="group" aria-label="Workbench text size">
          {TEXT_SIZE_OPTIONS.map((option) => (
            <button
              type="button"
              className={option.id === textSize ? 'is-active' : ''}
              aria-pressed={option.id === textSize}
              onClick={() => {
                onChange(option.id)
                setOpen(false)
              }}
              key={option.id}
            >
              <strong>{option.label}</strong>
              <small>{option.percentage}%</small>
            </button>
          ))}
        </div>
        <p className="commandbar-popover-note">
          Text size changes labels and code without changing the simulated display.
        </p>
      </ControlPopover>
    </div>
  )
}
