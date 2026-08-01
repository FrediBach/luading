import { useRef, useState } from 'react'
import { ControlIcon } from '../controls'
import { ControlPopover } from '../controls/ControlPopover'

export function AboutContent() {
  return (
    <div className="about-popover-content">
      <div className="about-popover-intro">
        <span className="about-popover-mark" aria-hidden="true">
          Lua!
        </span>
        <div>
          <p className="about-popover-kicker">Disting NT Lua Simulator</p>
          <p>
            Write, run, and test Disting NT Lua scripts in a browser-based
            development workbench.
          </p>
        </div>
      </div>

      <p className="about-popover-quick-start">
        <strong>Quick start</strong>
        Choose a bundled script or import a <code>.lua</code> file, edit it,
        then use <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> to run or
        reload.
      </p>

      <section aria-labelledby="about-capabilities-heading">
        <h3 id="about-capabilities-heading">Inside the workbench</h3>
        <ul className="about-popover-capabilities">
          <li>
            <strong>Develop</strong>
            <span>
              Lua editing with Disting API help, diagnostics, navigation, and
              bundled examples.
            </span>
          </li>
          <li>
            <strong>Patch</strong>
            <span>
              Interactive CV, gates, triggers, clocks, note patterns,
              parameters, and front-panel controls.
            </span>
          </li>
          <li>
            <strong>Inspect</strong>
            <span>
              Hardware display emulation, scopes, console output, contract
              checks, and browser performance data.
            </span>
          </li>
          <li>
            <strong>Connect</strong>
            <span>
              Optional Web Audio and Web MIDI input and output routing, plus
              preset-state simulation.
            </span>
          </li>
        </ul>
      </section>

      <section aria-labelledby="about-fidelity-heading">
        <h3 id="about-fidelity-heading">Simulation fidelity</h3>
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
      </section>

      <div className="about-popover-footer">
        <p className="commandbar-popover-note">
          Built against the documented scripting contract. Real Disting NT
          hardware remains the final authority; browser timing is not
          calibrated hardware CPU usage.
        </p>
        <p className="about-popover-disclaimer">
          Independent community project—not affiliated with or endorsed by
          Expert Sleepers.
        </p>
        <p className="about-popover-copyright">© 2026 Fredi Bach</p>
      </div>
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
        aria-label="Open Help & About"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ControlIcon name="info" size={15} />
      </button>
      <ControlPopover
        open={open}
        label="Help & About Luading"
        anchorRef={triggerRef}
        preferredWidth={480}
        onClose={() => setOpen(false)}
      >
        <AboutContent />
      </ControlPopover>
    </div>
  )
}
