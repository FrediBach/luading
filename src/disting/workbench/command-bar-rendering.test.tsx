import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DistingScriptExampleGroup } from '../script-examples'
import { AboutContent } from './AboutPopover'
import { CommandBar } from './CommandBar'
import { filterScriptGroups } from './script-menu'

const SCRIPT_GROUPS: DistingScriptExampleGroup[] = [
  {
    name: 'Official',
    examples: [
      {
        id: 'official/clock',
        name: 'Clock',
        group: 'official',
        source: 'return {}',
        modules: {},
      },
      {
        id: 'official/meter',
        name: 'Meter',
        group: 'official',
        source: 'return {}',
        modules: {},
      },
    ],
  },
  {
    name: 'Community',
    examples: [
      {
        id: 'community/drift',
        name: 'Analog Drift',
        group: 'community',
        source: 'return {}',
        modules: {},
      },
    ],
  },
]

describe('command bar utilities', () => {
  it('renders distinct Lua and signal-clock transports with shortcut hints', () => {
    const markup = renderToStaticMarkup(
      <CommandBar
        programName="Clock tool"
        selectedExampleId="official/clock"
        scriptGroups={SCRIPT_GROUPS}
        status="running"
        simulatedSeconds={1.25}
        clock={{ bpm: 120, running: true }}
        savedState
        programLoaded
        workspacePreset="patch"
        midi={{ bytes: [0x90, 60, 100], messages: ['noteOn'] }}
        qualityLabel="96 · A"
        qualityStatus="scored"
        qualityErrorCount={0}
        qualityWarningCount={1}
        canToggleRunning
        onSelectExample={() => undefined}
        onToggleRunning={() => undefined}
        onRun={() => undefined}
        onClockChange={() => undefined}
        onSaveState={() => undefined}
        onApplyWorkspacePreset={() => undefined}
        onMidiBytesChange={() => undefined}
        onSendMidi={() => undefined}
        onOpenProblems={() => undefined}
      />,
    )

    expect(markup).toContain('Clock tool')
    expect(markup).toContain('Pause Lua runtime')
    expect(markup).toContain('Control+Alt+P Meta+Alt+P')
    expect(markup).toContain('Stop global test-signal clock')
    expect(markup).toContain('Global test-signal clock tempo: 120 BPM')
    expect(markup).toContain('role="slider"')
    expect(markup).toContain('State saved. Save again.')
    expect(markup).toContain('aria-label="Lua runtime running"')
    expect(markup).toContain('title="1.250 s simulated"')
    expect(markup).toContain('Workspace preset: Patch')
    expect(markup).toContain('Open MIDI input utility')
    expect(markup).toContain('About Luading simulator')
  })

  it('presents load and unavailable states without ambiguous commands', () => {
    const markup = renderToStaticMarkup(
      <CommandBar
        programName="Lua script"
        selectedExampleId=""
        scriptGroups={SCRIPT_GROUPS}
        status="loading"
        simulatedSeconds={0}
        clock={{ bpm: 90, running: false }}
        savedState={false}
        programLoaded={false}
        workspacePreset={null}
        qualityLabel="Run to score"
        qualityStatus="pending"
        qualityErrorCount={0}
        qualityWarningCount={0}
        canToggleRunning={false}
        onSelectExample={() => undefined}
        onToggleRunning={() => undefined}
        onRun={() => undefined}
        onClockChange={() => undefined}
        onSaveState={() => undefined}
        onApplyWorkspacePreset={() => undefined}
        onMidiBytesChange={() => undefined}
        onSendMidi={() => undefined}
        onOpenProblems={() => undefined}
      />,
    )

    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('Run Lua script')
    expect(markup).toContain('Resume Lua runtime')
    expect(markup).toContain('Start global test-signal clock')
    expect(markup).toContain('Workspace preset: Custom')
    expect(markup).not.toContain('Open MIDI input utility')
  })

  it('filters bundled script groups by script, id, or group name', () => {
    expect(filterScriptGroups(SCRIPT_GROUPS, 'drift')).toEqual([
      {
        ...SCRIPT_GROUPS[1],
        examples: [SCRIPT_GROUPS[1].examples[0]],
      },
    ])
    expect(filterScriptGroups(SCRIPT_GROUPS, 'official')).toEqual([
      SCRIPT_GROUPS[0],
    ])
    expect(filterScriptGroups(SCRIPT_GROUPS, 'missing')).toEqual([])
  })

  it('retains the simulator contract and hardware-authority explanation', () => {
    const markup = renderToStaticMarkup(<AboutContent />)

    expect(markup).toContain('persistent Lua 5.4 VM')
    expect(markup).toContain('1 ms simulation steps')
    expect(markup).toContain('drawn at 30 fps')
    expect(markup).toContain('dedicated worker')
    expect(markup).toContain('hardware remains the final authority')
    expect(markup).toContain('not calibrated hardware CPU usage')
  })
})
