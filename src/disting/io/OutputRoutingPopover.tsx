import type { RefObject } from 'react'
import { ControlPopover, ControlIcon } from '../controls'
import type { AudioRouteDestination } from '../emulation/audio-routing'
import { AUDIO_DESTINATIONS } from './output-audio-controls'

interface Props {
  open: boolean
  label: string
  route: AudioRouteDestination
  audioEnabled: boolean
  anchorRef?: RefObject<HTMLElement | null>
  onChange(destination: AudioRouteDestination): void
  onClose(): void
}

export function OutputRoutingPopover({
  open,
  label,
  route,
  audioEnabled,
  anchorRef,
  onChange,
  onClose,
}: Props) {
  return (
    <ControlPopover
      open={open}
      label={`${label} · WebAudio route`}
      anchorRef={anchorRef}
      onClose={onClose}
    >
      <fieldset className="output-routing-options">
        <legend>Browser audio destination</legend>
        {AUDIO_DESTINATIONS.map((destination) => (
          <button
            type="button"
            className={route === destination.value ? 'is-active' : ''}
            aria-pressed={route === destination.value}
            onClick={() => onChange(destination.value)}
            key={destination.value}
          >
            <ControlIcon
              name={destination.value === 'off' ? 'close' : 'speaker'}
              size={15}
            />
            <span>
              <strong>{destination.label}</strong>
              <small>{destination.description}</small>
            </span>
          </button>
        ))}
      </fieldset>
      {!audioEnabled && route !== 'off' && (
        <p className="output-routing-notice">
          This route is ready. Enable WebAudio in the I/O header to hear it.
        </p>
      )}
    </ControlPopover>
  )
}
