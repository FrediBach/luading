import type { RefObject } from 'react'
import { ControlPopover, ControlIcon } from '../controls'
import type {
  MidiChannel,
  OutputChannelRoute,
  OutputKind,
  WebMidiDeviceState,
} from '../types'
import {
  AUDIO_DESTINATIONS,
  defaultWebMidiOutputRoute,
  outputRouteWithMidiKind,
} from './output-audio-controls'

interface Props {
  open: boolean
  label: string
  outputIndex: number
  outputKind: OutputKind
  outputNames: readonly string[]
  route: OutputChannelRoute
  audioEnabled: boolean
  midiDevices: WebMidiDeviceState
  midiError?: string
  anchorRef?: RefObject<HTMLElement | null>
  onChange(route: OutputChannelRoute): void
  onConnectMidi(): void
  onClose(): void
}

function finiteInput(value: string, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function OutputRoutingPopover({
  open,
  label,
  outputIndex,
  outputKind,
  outputNames,
  route,
  audioEnabled,
  midiDevices,
  midiError,
  anchorRef,
  onChange,
  onConnectMidi,
  onClose,
}: Props) {
  const isMidi = route.kind === 'webMidiCc'
    || route.kind === 'webMidiPitchBend'
    || route.kind === 'webMidiNote'
  const patchMidi = (update: Partial<OutputChannelRoute>) => {
    onChange({ ...route, ...update } as OutputChannelRoute)
  }
  const selectMidi = () => onChange(defaultWebMidiOutputRoute(
    outputKind,
    midiDevices.outputs.find((port) => port.state === 'connected')?.id ?? '',
  ))
  const pitchOutputs = outputNames
    .map((name, index) => ({ name, index }))
    .filter((output) => output.index !== outputIndex)

  return (
    <ControlPopover
      open={open}
      label={`${label} · output route`}
      anchorRef={anchorRef}
      positioning="viewport"
      preferredWidth={440}
      onClose={onClose}
    >
      <fieldset className="output-route-kind-options">
        <legend>Routing destination</legend>
        <button
          type="button"
          aria-pressed={route.kind === 'off'}
          onClick={() => onChange({ kind: 'off' })}
        >
          <ControlIcon name="close" size={15} />
          <span>Off</span>
        </button>
        <button
          type="button"
          aria-pressed={route.kind === 'webAudio'}
          onClick={() => onChange({
            kind: 'webAudio',
            destination: outputKind === 'stepped' ? 'kick' : 'synthNote',
          })}
        >
          <ControlIcon name="speaker" size={15} />
          <span>WebAudio</span>
        </button>
        <button
          type="button"
          aria-pressed={isMidi}
          onClick={selectMidi}
        >
          <ControlIcon name="midi" size={15} />
          <span>Web MIDI</span>
        </button>
      </fieldset>

      {route.kind === 'webAudio' && (
        <>
          <fieldset className="output-routing-options">
            <legend>Browser audio voice</legend>
            {AUDIO_DESTINATIONS.filter((destination) => destination.value !== 'off').map((destination) => (
              <button
                type="button"
                className={route.destination === destination.value ? 'is-active' : ''}
                aria-pressed={route.destination === destination.value}
                onClick={() => onChange({
                  kind: 'webAudio',
                  destination: destination.value as Exclude<typeof destination.value, 'off'>,
                })}
                key={destination.value}
              >
                <ControlIcon name="speaker" size={15} />
                <span>
                  <strong>{destination.label}</strong>
                  <small>{destination.description}</small>
                </span>
              </button>
            ))}
          </fieldset>
          {!audioEnabled && (
            <p className="output-routing-notice">
              This route is ready. Enable WebAudio in the I/O header to hear it.
            </p>
          )}
        </>
      )}

      {isMidi && (
        <div className="web-midi-output-routing">
          <div className="web-midi-output-grid">
            <label>
              <span>MIDI output</span>
              <select
                value={route.portId}
                onChange={(event) => patchMidi({ portId: event.target.value })}
              >
                <option value="">Select a device</option>
                {midiDevices.outputs.map((port) => (
                  <option value={port.id} key={port.id}>
                    {port.name}{port.state === 'connected' ? '' : ' (disconnected)'}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Channel</span>
              <select
                value={route.channel}
                onChange={(event) => patchMidi({
                  channel: Number(event.target.value) as MidiChannel,
                })}
              >
                {Array.from({ length: 16 }, (_, index) => index + 1).map((channel) => (
                  <option value={channel} key={channel}>Channel {channel}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Message</span>
              <select
                value={route.kind}
                onChange={(event) => onChange(outputRouteWithMidiKind(
                  event.target.value as 'webMidiCc' | 'webMidiPitchBend' | 'webMidiNote',
                  route,
                ))}
              >
                <option value="webMidiCc">Control change</option>
                <option value="webMidiPitchBend">Pitch bend</option>
                <option value="webMidiNote">Note / gate</option>
              </select>
            </label>

            {route.kind === 'webMidiCc' && (
              <label>
                <span>Controller</span>
                <input
                  type="number"
                  min="0"
                  max="127"
                  value={route.controller}
                  onChange={(event) => patchMidi({
                    controller: finiteInput(event.target.value, route.controller),
                  })}
                />
              </label>
            )}

            {(route.kind === 'webMidiCc' || route.kind === 'webMidiPitchBend') && (
              <>
                <label>
                  <span>Minimum voltage</span>
                  <input
                    type="number"
                    step="0.01"
                    value={route.minimumVolts}
                    onChange={(event) => patchMidi({
                      minimumVolts: finiteInput(event.target.value, route.minimumVolts),
                    })}
                  />
                </label>
                <label>
                  <span>Maximum voltage</span>
                  <input
                    type="number"
                    step="0.01"
                    value={route.maximumVolts}
                    onChange={(event) => patchMidi({
                      maximumVolts: finiteInput(event.target.value, route.maximumVolts),
                    })}
                  />
                </label>
              </>
            )}

            {route.kind === 'webMidiNote' && (
              <>
                <label>
                  <span>Pitch source</span>
                  <select
                    value={route.source.kind}
                    onChange={(event) => patchMidi({
                      source: event.target.value === 'fixed'
                        ? { kind: 'fixed', note: 60 }
                        : {
                            kind: 'output',
                            outputIndex: pitchOutputs[0]?.index ?? 0,
                            baseNote: 60,
                            baseVoltage: 0,
                          },
                    })}
                  >
                    <option value="fixed">Fixed note</option>
                    <option value="output" disabled={pitchOutputs.length === 0}>Another output (V/oct)</option>
                  </select>
                </label>

                {route.source.kind === 'fixed' ? (
                  <label>
                    <span>Note number</span>
                    <input
                      type="number"
                      min="0"
                      max="127"
                      value={route.source.note}
                      onChange={(event) => patchMidi({
                        source: {
                          kind: 'fixed',
                          note: finiteInput(event.target.value, route.source.kind === 'fixed' ? route.source.note : 60),
                        },
                      })}
                    />
                  </label>
                ) : (
                  <>
                    <label>
                      <span>V/oct output</span>
                      <select
                        value={route.source.outputIndex}
                        onChange={(event) => patchMidi({
                          source: {
                            kind: 'output',
                            outputIndex: Number(event.target.value),
                            baseNote: route.source.kind === 'output' ? route.source.baseNote : 60,
                            baseVoltage: route.source.kind === 'output' ? route.source.baseVoltage : 0,
                          },
                        })}
                      >
                        {pitchOutputs.map((output) => (
                          <option value={output.index} key={output.index}>
                            OUT {output.index + 1} · {output.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Base note</span>
                      <input
                        type="number"
                        min="0"
                        max="127"
                        value={route.source.baseNote}
                        onChange={(event) => patchMidi({
                          source: {
                            kind: 'output',
                            outputIndex: route.source.kind === 'output' ? route.source.outputIndex : 0,
                            baseNote: finiteInput(
                              event.target.value,
                              route.source.kind === 'output' ? route.source.baseNote : 60,
                            ),
                            baseVoltage: route.source.kind === 'output' ? route.source.baseVoltage : 0,
                          },
                        })}
                      />
                    </label>
                    <label>
                      <span>Base voltage</span>
                      <input
                        type="number"
                        step="0.01"
                        value={route.source.baseVoltage}
                        onChange={(event) => patchMidi({
                          source: {
                            kind: 'output',
                            outputIndex: route.source.kind === 'output' ? route.source.outputIndex : 0,
                            baseNote: route.source.kind === 'output' ? route.source.baseNote : 60,
                            baseVoltage: finiteInput(
                              event.target.value,
                              route.source.kind === 'output' ? route.source.baseVoltage : 0,
                            ),
                          },
                        })}
                      />
                    </label>
                  </>
                )}

                <label>
                  <span>Gate threshold</span>
                  <input
                    type="number"
                    step="0.01"
                    value={route.gateThresholdVolts}
                    onChange={(event) => patchMidi({
                      gateThresholdVolts: finiteInput(event.target.value, route.gateThresholdVolts),
                    })}
                  />
                </label>
                <label>
                  <span>Velocity</span>
                  <input
                    type="number"
                    min="1"
                    max="127"
                    value={route.velocity}
                    onChange={(event) => patchMidi({
                      velocity: finiteInput(event.target.value, route.velocity),
                    })}
                  />
                </label>
              </>
            )}
          </div>

          {midiDevices.status !== 'ready' && midiDevices.status !== 'unsupported' && (
            <button
              type="button"
              disabled={midiDevices.status === 'requesting'}
              onClick={onConnectMidi}
            >
              {midiDevices.status === 'requesting' ? 'Requesting MIDI access…' : 'Connect Web MIDI'}
            </button>
          )}
          {midiDevices.status === 'unsupported' && (
            <p className="output-routing-notice">Web MIDI is unavailable in this browser or context.</p>
          )}
          {midiError && (
            <p className="output-routing-error" role="alert">{midiError}</p>
          )}
        </div>
      )}
    </ControlPopover>
  )
}
