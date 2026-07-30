import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TraceHistory } from '../emulation/trace-history'
import type { LoadedProgram, SignalSourceConfig, TracePoint } from '../types'
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

describe('input channel rendering', () => {
  it('renders a live trigger tile with direct sync and fire actions', () => {
    const markup = renderToStaticMarkup(
      <InputChannelTile
        index={0}
        name="Reset"
        kind="trigger"
        source={source()}
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
        onTrigger={() => undefined}
        onProbeChange={() => undefined}
        onProbeFocus={() => undefined}
      />,
    )

    expect(markup).toContain('IN 1')
    expect(markup).toContain('trigger · Reset')
    expect(markup).toContain('5.000 V')
    expect(markup).toContain('aria-label="Reset clock sync"')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('aria-label="Fire Reset"')
    expect(markup).toContain('mini-signal-path')
  })

  it('renders all signal shapes and applicable advanced controls', () => {
    const markup = renderToStaticMarkup(
      <InputChannelInspector
        source={source({
          shape: 'gateSequencer',
          timing: { mode: 'free', frequencyHz: 2 },
          pulseWidth: 0.4,
          stepCount: 12,
        })}
        onChange={() => undefined}
      />,
    )

    expect(markup.match(/input-shape-picker/g)).toHaveLength(1)
    expect(markup.match(/aria-pressed=/g)).toHaveLength(14)
    expect(markup).toContain('Clock sync')
    expect(markup).toContain('Pulse width')
    expect(markup).toContain('Steps')
  })

  it('renders the compact global clock and every program input', () => {
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
        sources={[
          source(),
          source({ shape: 'manual', manualValue: 1.25 }),
        ]}
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
        clock={{ bpm: 120, running: true }}
        onClockChange={() => undefined}
        onSourceChange={() => undefined}
        onTrigger={() => undefined}
        onProbeChange={() => undefined}
        onProbeFocus={() => undefined}
      />,
    )

    expect(markup).toContain('I/O deck')
    expect(markup).toContain('Global test-signal clock')
    expect(markup).toContain('120')
    expect(markup).toContain('IN 1')
    expect(markup).toContain('IN 2')
    expect(markup).toContain('1.250 V')
    expect(markup).toContain('OUT 1')
    expect(markup).toContain('OUT 2')
    expect(markup).toContain('stepped · Gate')
    expect(markup).toContain('linear · Pitch')
  })
})
