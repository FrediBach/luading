import { useRef, useState } from 'react'
import { ControlIcon } from '../controls'
import { ControlPopover } from '../controls/ControlPopover'

export function AboutContent() {
  return (
    <div className="about-popover-content">
      <p>
        Luading is a browser workbench for developing Disting NT Lua
        scripts against the documented scripting contract.
      </p>
      <dl>
        <div>
          <dt>Runtime</dt>
          <dd>One persistent Lua 5.4 VM per loaded script</dd>
        </div>
        <div>
          <dt>Control</dt>
          <dd>Deterministic 1 ms simulation steps</dd>
        </div>
        <div>
          <dt>Display</dt>
          <dd>256×64 pixels, 16 shades, drawn at 30 fps</dd>
        </div>
        <div>
          <dt>Isolation</dt>
          <dd>Lua execution remains inside a dedicated worker</dd>
        </div>
      </dl>
      <p className="commandbar-popover-note">
        The local manual defines simulator behavior. Real Disting NT
        hardware remains the final authority; browser timing is not
        calibrated hardware CPU usage.
      </p>
    </div>
  )
}

export function AboutPopover() {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  return (
    <div className="commandbar-popover-shell about-popover">
      <button
        ref={triggerRef}
        type="button"
        className="commandbar-icon-command"
        aria-label="About Luading simulator"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ControlIcon name="info" size={15} />
      </button>
      <ControlPopover
        open={open}
        label="About Luading"
        anchorRef={triggerRef}
        preferredWidth={390}
        onClose={() => setOpen(false)}
      >
        <AboutContent />
      </ControlPopover>
    </div>
  )
}
