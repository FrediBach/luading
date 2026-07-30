import { useEffect, useRef, useState } from 'react'
import { ControlIcon } from '../controls'
import { ControlPopover } from '../controls/ControlPopover'
import {
  formatMidiByte,
  MIDI_MESSAGE_PRESETS,
  parseMidiByte,
  parseMidiMessage,
} from './midi-event'

interface Props {
  bytes: number[]
  messages?: string[]
  onBytesChange(bytes: number[]): void
  onSend(bytes: number[]): void
}

const BYTE_LABELS = ['Status', 'Data 1', 'Data 2']

export function MidiEventTool({
  bytes,
  messages = [],
  onBytesChange,
  onSend,
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
        label="MIDI input utility"
        anchorRef={triggerRef}
        onClose={() => setOpen(false)}
      >
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
      </ControlPopover>
    </div>
  )
}
