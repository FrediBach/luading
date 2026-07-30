import { ControlIcon } from '../controls'
import { Tooltip } from '../controls/Tooltip'

interface Props {
  saved: boolean
  disabled?: boolean
  onSave(): void
}

export function SaveStateControl({
  saved,
  disabled = false,
  onSave,
}: Props) {
  const label = saved ? 'State saved. Save again.' : 'Save script state'

  return (
    <Tooltip content={label} placement="bottom">
      <button
        type="button"
        className={`device-save-state${saved ? ' is-saved' : ''}`}
        aria-label={label}
        disabled={disabled}
        onClick={onSave}
      >
        <ControlIcon name="save" size={14} />
        <span>{saved ? 'Saved' : 'Save state'}</span>
      </button>
    </Tooltip>
  )
}

