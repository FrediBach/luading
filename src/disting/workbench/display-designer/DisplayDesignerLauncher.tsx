import { useRef, useState } from 'react'
import { ControlIcon } from '../../controls'
import { Tooltip } from '../../controls/Tooltip'
import { DisplayDesignerDialog } from './DisplayDesignerDialog'

export function DisplayDesignerLauncher() {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  return (
    <>
      <Tooltip content="Open Display designer" placement="bottom">
        <button
          ref={triggerRef}
          type="button"
          className="commandbar-icon-command"
          aria-label="Open Display designer"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <ControlIcon name="monitor" size={15} />
        </button>
      </Tooltip>
      <DisplayDesignerDialog
        open={open}
        returnFocusRef={triggerRef}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
