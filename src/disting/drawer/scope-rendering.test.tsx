import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TraceHistory } from '../emulation/trace-history'
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
  clockBeats: index * 0.002,
  inputs: [index % 20 < 10 ? 0 : 5],
  outputs: [index % 40 < 20 ? 0 : 5, (index % 12) / 12],
}))
const traceHistory = new TraceHistory()
traceHistory.append(trace)
const drawerCss = readFileSync(new URL('./drawer.css', import.meta.url), 'utf8')

describe('scope workspace rendering', () => {
  it('reserves a stable tabular width for signed voltage readouts', () => {
    expect(drawerCss).toMatch(
      /\.scope-legend-focus output\s*{[^}]*min-width: 8ch;[^}]*font-variant-numeric: tabular-nums;[^}]*text-align: right;/s,
    )
  })

  it('renders compact controls, routed legend chips, and responsive traces', () => {
    const markup = renderToStaticMarkup(
      <ScopeWorkspace
        traceHistory={traceHistory}
        traceRevision={1}
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
    expect(markup).toContain('class="scope-controls"')
    expect(markup).toContain('aria-label="Pause oscilloscope" aria-pressed="false"')
    expect(markup).toContain('<span>Pause</span>')
    expect(markup).toContain('role="switch" aria-label="Sync" checked=""')
    expect(markup).not.toContain('Scope synchronization')
    expect(markup).toContain('Trigger edge')
    expect(markup).toContain('<option value="clock">Global clock</option>')
    expect(markup).toContain('50 ms/div')
    expect(markup).toContain('5 V/div')
    expect(markup.match(/scope-legend-chip/g)).toHaveLength(4)
    expect(markup).toContain('OUT 1 · Gate')
    expect(markup).toContain('class="scope-legend-source">IN 1</span>')
    expect(markup).toContain('role="tooltip">Clock</span>')
    expect(markup).toContain('5.00 V')
    expect(markup).toContain('0.50 V')
    expect(markup).toContain('scope-path scope-path--2 is-focused')
    expect(markup).toContain('preserveAspectRatio="none"')
    expect(markup.indexOf('scope-pause-control')).toBeGreaterThan(
      markup.lastIndexOf('scope-legend-chip'),
    )
    expect(drawerCss).toMatch(
      /\.scope-pause-control\s*{[^}]*margin-left: auto;/s,
    )
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
