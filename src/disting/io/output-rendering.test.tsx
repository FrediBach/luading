import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TraceHistory } from '../emulation/trace-history'
import { AudioMasterControl } from './AudioMasterControl'
import { OutputChannelTile } from './OutputChannelTile'
import { OutputRoutingPopover } from './OutputRoutingPopover'

const trace = [
  { time: 0, inputs: [], outputs: [0, -1] },
  { time: 0.001, inputs: [], outputs: [5, 0] },
  { time: 0.002, inputs: [], outputs: [0, 1] },
]
const traceHistory = new TraceHistory()
traceHistory.append(trace)

describe('output channel rendering', () => {
  it('renders output identity, exact voltage, trace, and audio state', () => {
    const markup = renderToStaticMarkup(
      <OutputChannelTile
        index={0}
        name="Envelope"
        kind="stepped"
        value={5}
        traceHistory={traceHistory}
        traceRevision={1}
        route="kick"
        audioEnabled
        audioError={null}
        probes={[
          { id: 'probe-1', source: { kind: 'output', index: 0 } },
          { id: 'probe-2', source: null },
          { id: 'probe-3', source: null },
          { id: 'probe-4', source: null },
        ]}
        focusedScopeProbe={0}
        onRouteChange={() => undefined}
        onProbeChange={() => undefined}
        onProbeFocus={() => undefined}
      />,
    )

    expect(markup).toContain('OUT 1')
    expect(markup).toContain('stepped · Envelope')
    expect(markup).toContain('5.000 V')
    expect(markup).toContain('mini-signal-path')
    expect(markup).toContain('Kick')
    expect(markup).toContain('Live')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('output-channel-tile-shell scope-probe--1')
  })

  it('renders every channel-local destination and the disabled-master notice', () => {
    const markup = renderToStaticMarkup(
      <OutputRoutingPopover
        open
        label="OUT 2 · Pitch"
        route="synthNote"
        audioEnabled={false}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    expect(markup).toContain('Not connected')
    expect(markup).toContain('Kick trigger')
    expect(markup).toContain('Snare trigger')
    expect(markup).toContain('Hi-hat trigger')
    expect(markup).toContain('Synth note · V/oct')
    expect(markup).toContain('Synth trigger')
    expect(markup).toContain('Enable WebAudio in the I/O header')
    expect(markup).toContain('aria-pressed="true"')
  })

  it('distinguishes disabled, enabled, and unavailable audio states', () => {
    const render = (enabled: boolean, error: string | null) => (
      renderToStaticMarkup(
        <AudioMasterControl
          enabled={enabled}
          level={0.55}
          waveform="sawtooth"
          error={error}
          onToggle={() => undefined}
          onLevelChange={() => undefined}
          onWaveformChange={() => undefined}
        />,
      )
    )

    expect(render(false, null)).toContain('audio-master-control--disabled')
    expect(render(false, null)).toContain('>disabled</span>')
    expect(render(true, null)).toContain('audio-master-control--enabled')
    expect(render(true, null)).toContain('>enabled</span>')
    expect(render(false, 'AudioContext unavailable')).toContain(
      'audio-master-control--unavailable',
    )
    expect(render(false, 'AudioContext unavailable')).toContain(
      'role="alert"',
    )
  })
})
