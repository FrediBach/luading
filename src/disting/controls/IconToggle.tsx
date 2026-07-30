import type { ControlIconName } from './ControlIcon'
import { ControlIcon } from './ControlIcon'
import { Tooltip } from './Tooltip'

interface Props {
  icon: ControlIconName
  label: string
  pressed: boolean
  disabled?: boolean
  showLabel?: boolean
  onChange(pressed: boolean): void
}

export function IconToggle({
  icon,
  label,
  pressed,
  disabled = false,
  showLabel = false,
  onChange,
}: Props) {
  return (
    <Tooltip content={`${label} · ${pressed ? 'on' : 'off'}`}>
      <button
        type="button"
        className={`control-icon-toggle${pressed ? ' is-active' : ''}`}
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={() => onChange(!pressed)}
      >
        <ControlIcon name={icon} />
        {showLabel && <span>{label}</span>}
      </button>
    </Tooltip>
  )
}

