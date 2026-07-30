import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LoadedProgram, ScopeProbe, TracePoint } from '../types'
import { ScopeProbeChooser } from '../io/ScopeAssignmentButton'
import { ScopeWorkspace } from './ScopeWorkspace'

const program: LoadedProgram = {
  name: 'Scope',
  author: 'Test',
  inputCount: 1,
  outputCount: 2,
  inputNames: ['Clock'],
  outputNames: ['Gate', 'Pitch'],
  inputKinds: ['trigger'],
  outputKinds: ['stepped', 'linear'],
  parameters: [],
  customUi: false,
  uiPotPositions: [null, null, null],
}

const probes: ScopeProbe[] = [
  { id: 'probe-1', source: { kind: 'input', index: 0 } },
  { id: 'probe-2', source: { kind: 'output', index: 0 } },
  { id: 'probe-3', source: { kind: 'output', index: 1 } },
  { id: 'probe-4', source: null },
]

const trace: TracePoint[] = Array.from({ length: 600 }, (_, index) => ({
  time: index * 0.001,
  inputs: [index % 20 < 10 ? 0 : 5],
  outputs: [index % 40 < 20 ? 0 : 5, (index % 12) / 12],
}))

describe('scope workspace rendering', () => {
  it('renders compact controls, routed legend chips, and responsive traces', () => {
    const markup = renderToStaticMarkup(
      <ScopeWorkspace
        trace={trace}
        probes={probes}
        program={program}
        inputs={[5]}
        outputs={[0, 0.5]}
        focusedProbeIndex={1}
        onProbeChange={() => undefined}
        onProbeFocus={() => undefined}
      />,
    )

    expect(markup).toContain('Oscilloscope controls')
    expect(markup).toContain('Scope synchronization')
    expect(markup).toContain('Trigger edge')
    expect(markup).toContain('50 ms/div')
    expect(markup).toContain('5 V/div')
    expect(markup.match(/scope-legend-chip/g)).toHaveLength(4)
    expect(markup).toContain('OUT 1 · Gate')
    expect(markup).toContain('scope-path scope-path--2 is-focused')
    expect(markup).toContain('preserveAspectRatio="none"')
  })

  it('renders an explicit replacement chooser for a full probe bank', () => {
    const markup = renderToStaticMarkup(
      <ScopeProbeChooser
        label="IN 2 · Reset"
        source={{ kind: 'input', index: 1 }}
        probes={[
          ...probes.slice(0, 3),
          { id: 'probe-4', source: { kind: 'output', index: 0 } },
        ]}
        focusedProbeIndex={0}
        onChoose={() => undefined}
        onUnassign={() => undefined}
      />,
    )

    expect(markup).toContain('Selecting an occupied probe explicitly')
    expect(markup).toContain('Replace IN 1')
    expect(markup).toContain('Replace OUT 1')
    expect(markup.match(/scope-probe-choice/g)).toHaveLength(4)
  })
})
