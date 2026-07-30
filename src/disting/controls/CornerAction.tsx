import type { ControlIconName } from './ControlIcon'
import { ControlIcon } from './ControlIcon'
import { Tooltip } from './Tooltip'

interface Props {
  icon: ControlIconName
  label: string
  pressed?: boolean
  disabled?: boolean
  tone?: 'default' | 'warning' | 'error'
  onClick(): void
}

export function CornerAction({
  icon,
  label,
  pressed,
  disabled = false,
  tone = 'default',
  onClick,
}: Props) {
  return (
    <Tooltip content={`${label}${pressed === undefined ? '' : pressed ? ' · on' : ' · off'}`}>
      <button
        type="button"
        className={`control-corner-action control-corner-action--${tone}`}
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation()
          onClick()
        }}
      >
        <ControlIcon name={icon} size={13} />
      </button>
    </Tooltip>
  )
}

