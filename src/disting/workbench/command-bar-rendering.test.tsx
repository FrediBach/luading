import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DistingScriptExampleGroup } from '../script-examples'
import { AboutContent } from './AboutPopover'
import { CommandBar } from './CommandBar'
import { filterScriptGroups } from './script-menu'

const workbenchCss = readFileSync(
  new URL('./workbench.css', import.meta.url),
  'utf8',
)

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
        midi={{
          bytes: [0x90, 60, 100],
          messages: ['noteOn'],
          devices: { status: 'idle', inputs: [], outputs: [] },
          enabledInputIds: [],
          assignments: {},
        }}
        qualityLabel="96 · A"
        qualityStatus="scored"
        qualityErrorCount={0}
        qualityWarningCount={1}
        canToggleRunning
        theme="dark"
        textSize="standard"
        onSelectExample={() => undefined}
        onCreateScript={async () => true}
        onImportScript={() => undefined}
        onExportScript={() => undefined}
        onToggleRunning={() => undefined}
        onRun={() => undefined}
        onClockChange={() => undefined}
        onSaveState={() => undefined}
        onApplyWorkspacePreset={() => undefined}
        onMidiBytesChange={() => undefined}
        onSendMidi={() => undefined}
        onConnectMidi={() => undefined}
        onToggleMidiInput={() => undefined}
        onMidiAssignmentChange={() => undefined}
        onOpenProblems={() => undefined}
        onToggleTheme={() => undefined}
        onTextSizeChange={() => undefined}
      />,
    )

    expect(markup).toContain('Clock tool')
    expect(markup).toContain('aria-label="Script project"')
    expect(markup).toContain('src="/luading-logo.svg"')
    expect(markup).toContain('width="40" height="20" aria-hidden="true"')
    expect(markup).toContain('aria-label="Script execution"')
    expect(markup).toContain('aria-label="Script status"')
    expect(markup).toContain('aria-label="Workbench utilities"')
    expect(markup).toContain('aria-label="Open Display designer"')
    expect(markup).toContain('Display designer</span>')
    expect(markup).toContain('aria-label="Create new Lua script"')
    expect(markup).toContain('aria-haspopup="dialog"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('aria-label="Import Lua script"')
    expect(markup).toContain('aria-label="Export Lua script"')
    expect(markup).toContain('accept=".lua,text/x-lua,application/x-lua"')
    expect(markup).toContain('Pause Lua runtime')
    expect(markup).toContain('Control+Alt+P Meta+Alt+P')
    expect(markup).toContain('Stop global test-signal clock')
    expect(markup).toContain('Global test-signal clock tempo: 120 BPM')
    expect(markup).not.toContain('rotary-control-dial')
    expect(markup).toContain('State saved. Save again.')
    expect(markup).toContain('aria-label="Lua runtime running, 1.25 s simulated"')
    expect(markup).not.toContain('workbench-runtime-duration')
    expect(markup).toContain('Workspace preset: Patch')
    expect(markup).toContain('Open MIDI input utility')
    expect(markup).toContain('Open Help &amp; About')
    expect(markup).toContain('Switch to light mode')
    expect(markup).toContain('Text size: Standard')
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
        theme="light"
        textSize="large"
        onSelectExample={() => undefined}
        onCreateScript={async () => true}
        onImportScript={() => undefined}
        onExportScript={() => undefined}
        onToggleRunning={() => undefined}
        onRun={() => undefined}
        onClockChange={() => undefined}
        onSaveState={() => undefined}
        onApplyWorkspacePreset={() => undefined}
        onMidiBytesChange={() => undefined}
        onSendMidi={() => undefined}
        onConnectMidi={() => undefined}
        onToggleMidiInput={() => undefined}
        onMidiAssignmentChange={() => undefined}
        onOpenProblems={() => undefined}
        onToggleTheme={() => undefined}
        onTextSizeChange={() => undefined}
      />,
    )

    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('Run Lua script')
    expect(markup).toContain('Resume Lua runtime')
    expect(markup).toContain('Start global test-signal clock')
    expect(markup).toContain('aria-label="Lua runtime loading"')
    expect(markup).not.toContain('workbench-runtime-duration')
    expect(markup).toContain('Workspace preset: Custom')
    expect(markup).not.toContain('Open MIDI input utility')
    expect(markup).toContain('Open Display designer')
    expect(markup).toContain('Switch to dark mode')
    expect(markup).toContain('Text size: Large')
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

  it('explains the workbench, simulator contract, and project ownership', () => {
    const markup = renderToStaticMarkup(<AboutContent />)

    expect(markup).toContain('Quick start')
    expect(markup).toContain('class="about-popover-file-type"')
    expect(markup).toContain('Disting API help')
    expect(markup).toContain('note patterns')
    expect(markup).toContain('contract checks')
    expect(markup).toContain('Web Audio and Web MIDI')
    expect(markup).toContain('persistent Lua 5.4 VM')
    expect(markup).toContain('1 ms simulation steps')
    expect(markup).toContain('drawn at 30 fps')
    expect(markup).toContain('dedicated worker')
    expect(markup).toContain('hardware remains the final authority')
    expect(markup).toContain('not calibrated hardware CPU usage')
    expect(markup).toContain('not affiliated with or endorsed by')
    expect(markup).toContain('© 2026 Fredi Bach')
    expect(workbenchCss).toMatch(
      /\.about-popover-file-type \{[^}]*background: var\(--nt-green-soft\);[^}]*color: var\(--nt-green\);/s,
    )
  })
})
