import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TraceHistory } from '../emulation/trace-history'
import { DistingWebMidiManager } from '../emulation/web-midi'
import type {
  LoadedProgram,
  SignalSourceConfig,
  TracePoint,
  WebMidiDeviceState,
} from '../types'
import { InputChannelInspector } from './InputChannelInspector'
import { InputChannelTile } from './InputChannelTile'
import { IoDeck } from './IoDeck'

function source(
  update: Partial<SignalSourceConfig> = {},
): SignalSourceConfig {
  return {
    shape: 'trigger',
    timing: { mode: 'clock', division: '1/4' },
    amplitude: 5,
    offset: 0,
    phase: 0,
    pulseWidth: 0.01,
    manualValue: 0,
    seed: 1,
    stepCount: 8,
    ...update,
  }
}

const trace: TracePoint[] = [
  { time: 0, inputs: [0, 1], outputs: [] },
  { time: 0.001, inputs: [5, -1], outputs: [] },
  { time: 0.002, inputs: [0, 0], outputs: [] },
]
const traceHistory = new TraceHistory()
traceHistory.append(trace)
const midiDevices: WebMidiDeviceState = {
  status: 'ready',
  inputs: [{
    id: 'keys',
    type: 'input',
    name: 'Keys',
    manufacturer: 'Test',
    state: 'connected',
    connection: 'open',
  }],
  outputs: [],
}
const midiManager = new DistingWebMidiManager(null)

describe('input channel rendering', () => {
  it('renders a live trigger tile with direct sync and fire actions', () => {
    const markup = renderToStaticMarkup(
      <InputChannelTile
        index={0}
        name="Reset"
        kind="trigger"
        route={{ kind: 'generator', source: source() }}
        devices={midiDevices}
        value={5}
        traceHistory={traceHistory}
        traceRevision={1}
        probes={[
          { id: 'probe-1', source: { kind: 'input', index: 0 } },
          { id: 'probe-2', source: null },
          { id: 'probe-3', source: null },
          { id: 'probe-4', source: null },
        ]}
        focusedScopeProbe={0}
        onChange={() => undefined}
        onConnectMidi={() => undefined}
        onTrigger={() => undefined}
        onProbeChange={() => undefined}
        onProbeFocus={() => undefined}
      />,
    )

    expect(markup).toContain('IN 1')
    expect(markup).toContain('trigger · Reset')
    expect(markup).toContain('5.00 V')
    expect(markup).toContain('aria-label="Reset clock sync"')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('aria-label="Fire Reset"')
    expect(markup).toContain('mini-signal-path')
    expect(markup).toContain('input-channel-tile-shell scope-probe--1')
  })

  it('renders all signal shapes and applicable advanced controls', () => {
    const markup = renderToStaticMarkup(
      <InputChannelInspector
        kind="trigger"
        route={{
          kind: 'generator',
          source: source({
            shape: 'gateSequencer',
            timing: { mode: 'free', frequencyHz: 2 },
            pulseWidth: 0.4,
            stepCount: 12,
          }),
        }}
        devices={midiDevices}
        onChange={() => undefined}
        onConnectMidi={() => undefined}
      />,
    )

    expect(markup.match(/input-shape-picker/g)).toHaveLength(1)
    expect(markup.match(/aria-pressed=/g)).toHaveLength(16)
    expect(markup).toContain('Clock sync')
    expect(markup).toContain('Pulse width')
    expect(markup).toContain('Steps')
  })

  it('renders a MIDI-backed CV input with mapping controls and live status', () => {
    const route = {
      kind: 'webMidi' as const,
      mapping: {
        kind: 'cc' as const,
        portId: 'keys',
        channel: 'omni' as const,
        controller: 74,
        minimumVolts: -5,
        maximumVolts: 5,
      },
    }
    const inspector = renderToStaticMarkup(
      <InputChannelInspector
        kind="cv"
        route={route}
        devices={midiDevices}
        onChange={() => undefined}
        onConnectMidi={() => undefined}
      />,
    )
    const tile = renderToStaticMarkup(
      <InputChannelTile
        index={1}
        name="Pitch"
        kind="cv"
        route={route}
        devices={midiDevices}
        value={1.5}
        traceHistory={traceHistory}
        traceRevision={1}
        probes={[
          { id: 'probe-1', source: null },
          { id: 'probe-2', source: null },
          { id: 'probe-3', source: null },
          { id: 'probe-4', source: null },
        ]}
        focusedScopeProbe={null}
        onChange={() => undefined}
        onConnectMidi={() => undefined}
        onTrigger={() => undefined}
        onProbeChange={() => undefined}
        onProbeFocus={() => undefined}
      />,
    )

    expect(inspector).toContain('Input source')
    expect(inspector).toContain('Web MIDI')
    expect(inspector).toContain('Control change')
    expect(inspector).toContain('Controller')
    expect(inspector).toContain('Minimum voltage')
    expect(tile).toContain('Web MIDI · Live')
    expect(tile).toContain('1.50 V')
  })

  it('renders global audio controls and every program input', () => {
    const program: LoadedProgram = {
      name: 'Inputs',
      author: 'Test',
      inputCount: 2,
      outputCount: 2,
      inputNames: ['Clock', 'CV'],
      outputNames: ['Gate', 'Pitch'],
      inputKinds: ['trigger', 'cv'],
      outputKinds: ['stepped', 'linear'],
      parameters: [],
      customUi: false,
      uiPotPositions: [null, null, null],
    }
    const markup = renderToStaticMarkup(
      <IoDeck
        program={program}
        inputRoutes={[
          { kind: 'generator', source: source() },
          { kind: 'generator', source: source({ shape: 'manual', manualValue: 1.25 }) },
        ]}
        midiDevices={midiDevices}
        midiManager={midiManager}
        values={[0, 1.25]}
        outputs={[5, 0.25]}
        probes={[
          { id: 'probe-1', source: { kind: 'input', index: 0 } },
          { id: 'probe-2', source: { kind: 'output', index: 0 } },
          { id: 'probe-3', source: null },
          { id: 'probe-4', source: null },
        ]}
        focusedScopeProbe={0}
        traceHistory={traceHistory}
        traceRevision={1}
        onInputRouteChange={() => undefined}
        onConnectMidi={() => undefined}
        onTrigger={() => undefined}
        onProbeChange={() => undefined}
        onProbeFocus={() => undefined}
      />,
    )

    expect(markup).toContain('WebAudio monitoring')
    expect(markup).toContain('IN 1')
    expect(markup).toContain('IN 2')
    expect(markup).toContain('1.25 V')
    expect(markup).toContain('input-channel-tile-shell scope-probe--1')
    expect(markup).toContain('output-channel-tile-shell scope-probe--2')
    expect(markup).toContain('OUT 1')
    expect(markup).toContain('OUT 2')
    expect(markup).toContain('stepped · Gate')
    expect(markup).toContain('linear · Pitch')
    expect(markup.match(/io-channel-grid-spacer/g)).toHaveLength(4)
  })

  it('reserves a four-channel footprint without rendering fake channels', () => {
    const program: LoadedProgram = {
      name: 'Single channel',
      author: 'Test',
      inputCount: 1,
      outputCount: 1,
      inputNames: ['CV'],
      outputNames: ['Signal'],
      inputKinds: ['cv'],
      outputKinds: ['linear'],
      parameters: [],
      customUi: false,
      uiPotPositions: [null, null, null],
    }
    const markup = renderToStaticMarkup(
      <IoDeck
        program={program}
        inputRoutes={[{ kind: 'generator', source: source({ shape: 'manual' }) }]}
        midiDevices={midiDevices}
        midiManager={midiManager}
        values={[0]}
        outputs={[0]}
        probes={[
          { id: 'probe-1', source: null },
          { id: 'probe-2', source: null },
          { id: 'probe-3', source: null },
          { id: 'probe-4', source: null },
        ]}
        focusedScopeProbe={null}
        traceHistory={traceHistory}
        traceRevision={1}
        onInputRouteChange={() => undefined}
        onConnectMidi={() => undefined}
        onTrigger={() => undefined}
        onProbeChange={() => undefined}
        onProbeFocus={() => undefined}
      />,
    )

    expect(markup.match(/io-channel-grid-spacer/g)).toHaveLength(6)
    expect(markup.match(/input-channel-tile-shell/g)).toHaveLength(1)
    expect(markup.match(/output-channel-tile-shell/g)).toHaveLength(1)
    expect(markup).not.toContain('IN 2')
    expect(markup).not.toContain('OUT 2')
  })

  it('explains how to populate empty input and output panels', () => {
    const program: LoadedProgram = {
      name: 'No channels',
      author: 'Test',
      inputCount: 0,
      outputCount: 0,
      inputNames: [],
      outputNames: [],
      inputKinds: [],
      outputKinds: [],
      parameters: [],
      customUi: false,
      uiPotPositions: [null, null, null],
    }
    const markup = renderToStaticMarkup(
      <IoDeck
        program={program}
        inputRoutes={[]}
        midiDevices={midiDevices}
        midiManager={midiManager}
        values={[]}
        outputs={[]}
        probes={[
          { id: 'probe-1', source: null },
          { id: 'probe-2', source: null },
          { id: 'probe-3', source: null },
          { id: 'probe-4', source: null },
        ]}
        focusedScopeProbe={null}
        traceHistory={traceHistory}
        traceRevision={1}
        onInputRouteChange={() => undefined}
        onConnectMidi={() => undefined}
        onTrigger={() => undefined}
        onProbeChange={() => undefined}
        onProbeFocus={() => undefined}
      />,
    )

    expect(markup).toContain('No inputs')
    expect(markup).toContain('No outputs')
    expect(markup).toContain('create test signals here')
    expect(markup).toContain('inspect and monitor signals here')
    expect(markup).not.toContain('io-channel-grid-spacer')
  })
})
