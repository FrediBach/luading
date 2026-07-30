import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKBENCH_LAYOUT,
  clampDrawerHeight,
  clampSplitPercent,
  normalizeWorkbenchLayout,
  WORKSPACE_PRESET_LAYOUTS,
  workbenchLayoutReducer,
} from './workbench-layout'

describe('workbench layout', () => {
  it('clamps split and drawer dimensions to usable ranges', () => {
    expect(clampSplitPercent(12)).toBe(38)
    expect(clampSplitPercent(90)).toBe(72)
    expect(clampSplitPercent(Number.NaN)).toBe(DEFAULT_WORKBENCH_LAYOUT.splitPercent)
    expect(clampDrawerHeight(20)).toBe(140)
    expect(clampDrawerHeight(900)).toBe(420)
    expect(clampDrawerHeight(Number.POSITIVE_INFINITY)).toBe(DEFAULT_WORKBENCH_LAYOUT.drawerHeight)
  })

  it('normalizes partial or stale persisted state', () => {
    expect(normalizeWorkbenchLayout({
      splitPercent: 99,
      drawerHeight: 200,
      drawerOpen: false,
      activeDrawerTab: 'console',
      density: 'comfortable',
      responsiveMode: 'editor',
      workspacePreset: 'monitor',
    })).toEqual({
      splitPercent: 72,
      drawerHeight: 200,
      drawerOpen: false,
      activeDrawerTab: 'console',
      density: 'comfortable',
      responsiveMode: 'editor',
      workspacePreset: null,
    })

    expect(normalizeWorkbenchLayout({
      activeDrawerTab: 'unknown',
      density: 'touch',
      responsiveMode: 'unknown',
    })).toEqual({
      ...DEFAULT_WORKBENCH_LAYOUT,
      workspacePreset: null,
    })

    expect(normalizeWorkbenchLayout(DEFAULT_WORKBENCH_LAYOUT))
      .toEqual(DEFAULT_WORKBENCH_LAYOUT)
  })

  it('persists the narrow Editor or Instrument view independently of presets', () => {
    const editorMode = workbenchLayoutReducer(DEFAULT_WORKBENCH_LAYOUT, {
      type: 'setResponsiveMode',
      mode: 'editor',
    })
    expect(editorMode.responsiveMode).toBe('editor')
    expect(editorMode.workspacePreset).toBe('patch')

    const compact = workbenchLayoutReducer(editorMode, {
      type: 'applyPreset',
      preset: 'compact',
    })
    expect(compact.responsiveMode).toBe('editor')
    expect(compact.workspacePreset).toBe('compact')
  })

  it('opens, switches, and collapses drawer tabs predictably', () => {
    const opened = workbenchLayoutReducer(
      { ...DEFAULT_WORKBENCH_LAYOUT, drawerOpen: false },
      { type: 'toggleDrawer', tab: 'problems' },
    )
    expect(opened.drawerOpen).toBe(true)
    expect(opened.activeDrawerTab).toBe('problems')
    expect(opened.workspacePreset).toBeNull()

    const switched = workbenchLayoutReducer(opened, {
      type: 'toggleDrawer',
      tab: 'console',
    })
    expect(switched.drawerOpen).toBe(true)
    expect(switched.activeDrawerTab).toBe('console')

    const collapsed = workbenchLayoutReducer(switched, {
      type: 'toggleDrawer',
      tab: 'console',
    })
    expect(collapsed.drawerOpen).toBe(false)
    expect(collapsed.activeDrawerTab).toBe('console')
  })

  it('resets the split and marks a manually changed workspace as custom', () => {
    const state = {
      ...DEFAULT_WORKBENCH_LAYOUT,
      splitPercent: 41,
      drawerOpen: false,
      activeDrawerTab: 'performance' as const,
    }

    expect(workbenchLayoutReducer(state, { type: 'resetSplit' })).toEqual({
      ...state,
      splitPercent: DEFAULT_WORKBENCH_LAYOUT.splitPercent,
      workspacePreset: null,
    })
  })

  it('applies complete Code, Patch, Monitor, and Compact presets', () => {
    const presets = ['code', 'patch', 'monitor', 'compact'] as const

    for (const preset of presets) {
      expect(workbenchLayoutReducer(DEFAULT_WORKBENCH_LAYOUT, {
        type: 'applyPreset',
        preset,
      })).toEqual({
        ...WORKSPACE_PRESET_LAYOUTS[preset],
        responsiveMode: DEFAULT_WORKBENCH_LAYOUT.responsiveMode,
        workspacePreset: preset,
      })
    }
  })
})
