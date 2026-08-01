import {
  defaultWebMidiInputMapping,
} from '../emulation/midi-routing'
import type {
  InputKind,
  MidiChannelFilter,
  WebMidiDeviceState,
  WebMidiInputMapping,
} from '../types'

interface Props {
  inputKind: InputKind
  mapping: WebMidiInputMapping
  devices: WebMidiDeviceState
  onChange(mapping: WebMidiInputMapping): void
  onConnect(): void
}

const CHANNELS: MidiChannelFilter[] = [
  'omni', 1, 2, 3, 4, 5, 6, 7, 8,
  9, 10, 11, 12, 13, 14, 15, 16,
]

const MAPPING_OPTIONS: Record<InputKind, Array<{
  value: WebMidiInputMapping['kind']
  label: string
}>> = {
  cv: [
    { value: 'cc', label: 'Control change' },
    { value: 'pitchBend', label: 'Pitch bend' },
    { value: 'notePitch', label: 'Note pitch (V/oct)' },
    { value: 'noteVelocity', label: 'Note velocity' },
  ],
  gate: [
    { value: 'noteGate', label: 'Note gate' },
    { value: 'ccGate', label: 'CC threshold gate' },
  ],
  trigger: [
    { value: 'noteTrigger', label: 'Note-on trigger' },
    { value: 'ccTrigger', label: 'CC threshold trigger' },
  ],
}

function finiteInput(value: string, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function webMidiMappingForKind(
  inputKind: InputKind,
  kind: WebMidiInputMapping['kind'],
  current: WebMidiInputMapping,
): WebMidiInputMapping {
  const common = { portId: current.portId, channel: current.channel }
  switch (kind) {
    case 'cc':
      return { ...common, kind, controller: 1, minimumVolts: 0, maximumVolts: 5 }
    case 'pitchBend':
      return { ...common, kind, minimumVolts: -5, maximumVolts: 5 }
    case 'notePitch':
      return { ...common, kind, baseNote: 60, baseVoltage: 0 }
    case 'noteVelocity':
      return { ...common, kind, note: 'any', minimumVolts: 0, maximumVolts: 5 }
    case 'noteGate':
    case 'noteTrigger':
      return { ...common, kind, note: 'any', lowVolts: 0, highVolts: 5 }
    case 'ccGate':
    case 'ccTrigger':
      return { ...common, kind, controller: 1, threshold: 64, lowVolts: 0, highVolts: 5 }
    default:
      return defaultWebMidiInputMapping(inputKind, current.portId)
  }
}

export function WebMidiInputInspector({
  inputKind,
  mapping,
  devices,
  onChange,
  onConnect,
}: Props) {
  const patch = (update: Partial<WebMidiInputMapping>) => {
    onChange({ ...mapping, ...update } as WebMidiInputMapping)
  }
  const voltageRange = mapping.kind === 'cc'
    || mapping.kind === 'pitchBend'
    || mapping.kind === 'noteVelocity'
  const binary = mapping.kind === 'noteGate'
    || mapping.kind === 'noteTrigger'
    || mapping.kind === 'ccGate'
    || mapping.kind === 'ccTrigger'

  return (
    <div className="web-midi-input-inspector">
      <div className="web-midi-input-grid">
        <label>
          <span>MIDI input</span>
          <select
            value={mapping.portId}
            onChange={(event) => patch({ portId: event.target.value })}
          >
            <option value="">Select a device</option>
            {devices.inputs.map((port) => (
              <option value={port.id} key={port.id}>
                {port.name}{port.state === 'connected' ? '' : ' (disconnected)'}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Channel</span>
          <select
            value={mapping.channel}
            onChange={(event) => patch({
              channel: event.target.value === 'omni'
                ? 'omni'
                : Number(event.target.value) as MidiChannelFilter,
            })}
          >
            {CHANNELS.map((channel) => (
              <option value={channel} key={channel}>
                {channel === 'omni' ? 'Omni' : `Channel ${channel}`}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Message</span>
          <select
            value={mapping.kind}
            onChange={(event) => onChange(webMidiMappingForKind(
              inputKind,
              event.target.value as WebMidiInputMapping['kind'],
              mapping,
            ))}
          >
            {MAPPING_OPTIONS[inputKind].map((option) => (
              <option value={option.value} key={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        {(mapping.kind === 'cc' || mapping.kind === 'ccGate' || mapping.kind === 'ccTrigger') && (
          <label>
            <span>Controller</span>
            <input
              type="number"
              min="0"
              max="127"
              value={mapping.controller}
              onChange={(event) => patch({
                controller: finiteInput(event.target.value, mapping.controller),
              })}
            />
          </label>
        )}

        {(mapping.kind === 'noteGate'
          || mapping.kind === 'noteTrigger'
          || mapping.kind === 'noteVelocity') && (
          <label>
            <span>Note filter</span>
            <select
              value={mapping.note === 'any' ? 'any' : 'note'}
              onChange={(event) => patch({
                note: event.target.value === 'any' ? 'any' : 60,
              })}
            >
              <option value="any">Any note</option>
              <option value="note">Specific note</option>
            </select>
          </label>
        )}

        {(mapping.kind === 'noteGate'
          || mapping.kind === 'noteTrigger'
          || mapping.kind === 'noteVelocity') && mapping.note !== 'any' && (
          <label>
            <span>Note number</span>
            <input
              type="number"
              min="0"
              max="127"
              value={mapping.note}
              onChange={(event) => patch({
                note: finiteInput(event.target.value, mapping.note as number),
              })}
            />
          </label>
        )}

        {mapping.kind === 'notePitch' && (
          <>
            <label>
              <span>Base note</span>
              <input
                type="number"
                min="0"
                max="127"
                value={mapping.baseNote}
                onChange={(event) => patch({
                  baseNote: finiteInput(event.target.value, mapping.baseNote),
                })}
              />
            </label>
            <label>
              <span>Base voltage</span>
              <input
                type="number"
                step="0.01"
                value={mapping.baseVoltage}
                onChange={(event) => patch({
                  baseVoltage: finiteInput(event.target.value, mapping.baseVoltage),
                })}
              />
            </label>
          </>
        )}

        {(mapping.kind === 'ccGate' || mapping.kind === 'ccTrigger') && (
          <label>
            <span>Threshold</span>
            <input
              type="number"
              min="0"
              max="127"
              value={mapping.threshold}
              onChange={(event) => patch({
                threshold: finiteInput(event.target.value, mapping.threshold),
              })}
            />
          </label>
        )}

        {voltageRange && (
          <>
            <label>
              <span>Minimum voltage</span>
              <input
                type="number"
                step="0.01"
                value={mapping.minimumVolts}
                onChange={(event) => patch({
                  minimumVolts: finiteInput(event.target.value, mapping.minimumVolts),
                })}
              />
            </label>
            <label>
              <span>Maximum voltage</span>
              <input
                type="number"
                step="0.01"
                value={mapping.maximumVolts}
                onChange={(event) => patch({
                  maximumVolts: finiteInput(event.target.value, mapping.maximumVolts),
                })}
              />
            </label>
          </>
        )}

        {binary && (
          <>
            <label>
              <span>Low voltage</span>
              <input
                type="number"
                step="0.01"
                value={mapping.lowVolts}
                onChange={(event) => patch({
                  lowVolts: finiteInput(event.target.value, mapping.lowVolts),
                })}
              />
            </label>
            <label>
              <span>High voltage</span>
              <input
                type="number"
                step="0.01"
                value={mapping.highVolts}
                onChange={(event) => patch({
                  highVolts: finiteInput(event.target.value, mapping.highVolts),
                })}
              />
            </label>
          </>
        )}
      </div>

      {devices.status !== 'ready' && devices.status !== 'unsupported' && (
        <button
          type="button"
          disabled={devices.status === 'requesting'}
          onClick={onConnect}
        >
          {devices.status === 'requesting' ? 'Requesting MIDI access…' : 'Connect Web MIDI'}
        </button>
      )}
      {devices.status === 'unsupported' && (
        <p>Web MIDI is unavailable in this browser or context.</p>
      )}
    </div>
  )
}
