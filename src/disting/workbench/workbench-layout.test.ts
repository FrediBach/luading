import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKBENCH_LAYOUT,
  clampDrawerHeight,
  clampSplitPercent,
  normalizeWorkbenchLayout,
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
    })).toEqual({
      splitPercent: 72,
      drawerHeight: 200,
      drawerOpen: false,
      activeDrawerTab: 'console',
      density: 'comfortable',
    })

    expect(normalizeWorkbenchLayout({
      activeDrawerTab: 'unknown',
      density: 'touch',
    })).toEqual(DEFAULT_WORKBENCH_LAYOUT)
  })

  it('opens, switches, and collapses drawer tabs predictably', () => {
    const opened = workbenchLayoutReducer(
      { ...DEFAULT_WORKBENCH_LAYOUT, drawerOpen: false },
      { type: 'toggleDrawer', tab: 'problems' },
    )
    expect(opened.drawerOpen).toBe(true)
    expect(opened.activeDrawerTab).toBe('problems')

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

  it('resets the split without changing other presentation state', () => {
    const state = {
      ...DEFAULT_WORKBENCH_LAYOUT,
      splitPercent: 41,
      drawerOpen: false,
      activeDrawerTab: 'performance' as const,
    }

    expect(workbenchLayoutReducer(state, { type: 'resetSplit' })).toEqual({
      ...state,
      splitPercent: DEFAULT_WORKBENCH_LAYOUT.splitPercent,
    })
  })
})

