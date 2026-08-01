import { useEffect, useRef, useState } from 'react'
import { ControlIcon } from '../controls'
import { ControlPopover } from '../controls/ControlPopover'
import { DISTING_MIDI_DESTINATIONS } from '../emulation/midi-routing'
import type {
  DistingMidiDestination,
  DistingMidiPortAssignments,
  WebMidiDeviceState,
} from '../types'
import {
  formatMidiByte,
  MIDI_MESSAGE_PRESETS,
  parseMidiByte,
  parseMidiMessage,
} from './midi-event'

interface Props {
  bytes: number[]
  messages?: string[]
  devices: WebMidiDeviceState
  enabledInputIds: string[]
  assignments: DistingMidiPortAssignments
  onBytesChange(bytes: number[]): void
  onSend(bytes: number[]): void
  onConnect(): void
  onToggleInput(portId: string, enabled: boolean): void
  onAssignmentChange(destination: DistingMidiDestination, portId: string): void
}

const BYTE_LABELS = ['Status', 'Data 1', 'Data 2']

type RoutingPanelProps = Pick<
  Props,
  | 'devices'
  | 'enabledInputIds'
  | 'assignments'
  | 'onConnect'
  | 'onToggleInput'
  | 'onAssignmentChange'
>

export function MidiRoutingPanel({
  devices,
  enabledInputIds,
  assignments,
  onConnect,
  onToggleInput,
  onAssignmentChange,
}: RoutingPanelProps) {
  return (
    <section className="midi-device-section" aria-labelledby="web-midi-heading">
      <div className="midi-section-heading">
        <h3 id="web-midi-heading">Web MIDI</h3>
        <span role="status" aria-live="polite">{devices.status}</span>
      </div>

      {devices.status === 'unsupported' ? (
        <p>Web MIDI is unavailable in this browser or context.</p>
      ) : devices.status !== 'ready' ? (
        <button
          type="button"
          disabled={devices.status === 'requesting'}
          onClick={onConnect}
        >
          {devices.status === 'requesting' ? 'Requesting access…' : 'Connect Web MIDI'}
        </button>
      ) : (
        <>
          <fieldset className="midi-input-ports">
            <legend>Inputs sent to the Lua MIDI callback</legend>
            {devices.inputs.length === 0 ? (
              <p>No MIDI inputs found.</p>
            ) : devices.inputs.map((port) => (
              <label key={port.id}>
                <input
                  type="checkbox"
                  checked={enabledInputIds.includes(port.id)}
                  disabled={port.state !== 'connected'}
                  onChange={(event) => onToggleInput(port.id, event.target.checked)}
                />
                <span>{port.name}</span>
                <small>{port.state}</small>
              </label>
            ))}
          </fieldset>

          <fieldset className="midi-output-ports">
            <legend>Lua sendMIDI destinations</legend>
            {DISTING_MIDI_DESTINATIONS.map((destination) => (
              <label key={destination.id}>
                <span>{destination.label} · 0x{destination.bit.toString(16).toUpperCase()}</span>
                <select
                  aria-label={`${destination.label} Web MIDI output`}
                  value={assignments[destination.id] ?? ''}
                  onChange={(event) => onAssignmentChange(
                    destination.id,
                    event.target.value,
                  )}
                >
                  <option value="">Not connected</option>
                  {devices.outputs.map((port) => (
                    <option value={port.id} key={port.id}>
                      {port.name}{port.state === 'connected' ? '' : ' (disconnected)'}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>
        </>
      )}

      {devices.error && <p className="midi-device-error">{devices.error}</p>}
    </section>
  )
}

export function MidiEventTool({
  bytes,
  messages = [],
  devices,
  enabledInputIds,
  assignments,
  onBytesChange,
  onSend,
  onConnect,
  onToggleInput,
  onAssignmentChange,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState(() => bytes.map(formatMidiByte))

  useEffect(() => {
    setDrafts(bytes.map(formatMidiByte))
  }, [bytes])

  const parsedMessage = parseMidiMessage(drafts)

  return (
    <div className="commandbar-popover-shell midi-event-tool">
      <button
        ref={triggerRef}
        type="button"
        className="commandbar-icon-command"
        aria-label="Open MIDI input utility"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ControlIcon name="midi" size={15} />
        <span>MIDI</span>
      </button>
      <ControlPopover
        open={open}
        label="MIDI routing and input utility"
        anchorRef={triggerRef}
        preferredWidth={410}
        onClose={() => setOpen(false)}
      >
        <MidiRoutingPanel
          devices={devices}
          enabledInputIds={enabledInputIds}
          assignments={assignments}
          onConnect={onConnect}
          onToggleInput={onToggleInput}
          onAssignmentChange={onAssignmentChange}
        />

        <section className="midi-manual-section" aria-labelledby="manual-midi-heading">
          <h3 id="manual-midi-heading">Manual MIDI input</h3>
          <div className="midi-preset-options" aria-label="Common MIDI messages">
          {MIDI_MESSAGE_PRESETS.map((preset) => (
            <button
              type="button"
              onClick={() => {
                const nextBytes = [...preset.bytes]
                setDrafts(nextBytes.map(formatMidiByte))
                onBytesChange(nextBytes)
              }}
              key={preset.id}
            >
              {preset.label}
            </button>
          ))}
          </div>

          <div className="midi-byte-fields">
          {BYTE_LABELS.map((label, index) => {
            const parsedByte = parseMidiByte(drafts[index] ?? '')
            return (
              <label key={label}>
                <span>{label}</span>
                <input
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-label={`MIDI byte ${index + 1} (${label})`}
                  aria-invalid={parsedByte === null}
                  value={drafts[index] ?? ''}
                  onChange={(event) => {
                    const nextDrafts = drafts.map((draft, byteIndex) => (
                      byteIndex === index ? event.target.value : draft
                    ))
                    setDrafts(nextDrafts)
                  }}
                  onBlur={() => {
                    const nextMessage = parseMidiMessage(drafts)
                    if (nextMessage) onBytesChange(nextMessage)
                  }}
                />
                <small>{parsedByte === null ? 'Invalid' : `${parsedByte} decimal`}</small>
              </label>
            )
          })}
          </div>

          {messages.length > 0 && (
            <p className="midi-declared-messages">
              Script declares: {messages.join(', ')}
            </p>
          )}

          <div className="midi-send-row">
          <span role="status" aria-live="polite">
            {parsedMessage ? 'Three valid bytes' : 'Enter bytes from 0 to 255'}
          </span>
          <button
            type="button"
            disabled={!parsedMessage}
            onClick={() => {
              if (!parsedMessage) return
              onBytesChange(parsedMessage)
              onSend(parsedMessage)
            }}
          >
            Send MIDI
          </button>
          </div>
        </section>
      </ControlPopover>
    </div>
  )
}
