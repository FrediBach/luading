export type DrawerTabId = 'scope' | 'problems' | 'console' | 'performance'
export type WorkbenchDensity = 'compact' | 'comfortable'
export type WorkspacePresetId = 'code' | 'patch' | 'monitor' | 'compact'
export type ResponsiveWorkbenchMode = 'editor' | 'instrument'

export interface WorkbenchLayoutState {
  splitPercent: number
  drawerHeight: number
  drawerOpen: boolean
  activeDrawerTab: DrawerTabId
  density: WorkbenchDensity
  responsiveMode: ResponsiveWorkbenchMode
  workspacePreset: WorkspacePresetId | null
}

export type WorkbenchLayoutAction =
  | { type: 'setSplit'; value: number }
  | { type: 'resetSplit' }
  | { type: 'setDrawerHeight'; value: number }
  | { type: 'openDrawer'; tab?: DrawerTabId }
  | { type: 'closeDrawer' }
  | { type: 'toggleDrawer'; tab: DrawerTabId }
  | { type: 'setDensity'; density: WorkbenchDensity }
  | { type: 'setResponsiveMode'; mode: ResponsiveWorkbenchMode }
  | { type: 'applyPreset'; preset: WorkspacePresetId }

export const WORKSPACE_PRESET_LAYOUTS: Record<
  WorkspacePresetId,
  Omit<WorkbenchLayoutState, 'responsiveMode' | 'workspacePreset'>
> = {
  code: {
    splitPercent: 72,
    drawerHeight: 220,
    drawerOpen: false,
    activeDrawerTab: 'problems',
    density: 'comfortable',
  },
  patch: {
    splitPercent: 60,
    drawerHeight: 220,
    drawerOpen: true,
    activeDrawerTab: 'scope',
    density: 'compact',
  },
  monitor: {
    splitPercent: 38,
    drawerHeight: 300,
    drawerOpen: true,
    activeDrawerTab: 'scope',
    density: 'comfortable',
  },
  compact: {
    splitPercent: 54,
    drawerHeight: 180,
    drawerOpen: false,
    activeDrawerTab: 'scope',
    density: 'compact',
  },
}

export const DEFAULT_WORKBENCH_LAYOUT: WorkbenchLayoutState = {
  ...WORKSPACE_PRESET_LAYOUTS.patch,
  responsiveMode: 'instrument',
  workspacePreset: 'patch',
}

export const WORKBENCH_LAYOUT_STORAGE_KEY = 'luading.workbench-layout.v1'

export function clampSplitPercent(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_WORKBENCH_LAYOUT.splitPercent
  return Math.min(72, Math.max(38, value))
}

export function clampDrawerHeight(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_WORKBENCH_LAYOUT.drawerHeight
  return Math.min(420, Math.max(140, value))
}

function isDrawerTab(value: unknown): value is DrawerTabId {
  return value === 'scope'
    || value === 'problems'
    || value === 'console'
    || value === 'performance'
}

function isDensity(value: unknown): value is WorkbenchDensity {
  return value === 'compact' || value === 'comfortable'
}

function isResponsiveMode(value: unknown): value is ResponsiveWorkbenchMode {
  return value === 'editor' || value === 'instrument'
}

function isWorkspacePreset(value: unknown): value is WorkspacePresetId {
  return value === 'code'
    || value === 'patch'
    || value === 'monitor'
    || value === 'compact'
}

function matchesPreset(
  state: Omit<WorkbenchLayoutState, 'responsiveMode' | 'workspacePreset'>,
  preset: WorkspacePresetId,
) {
  const expected = WORKSPACE_PRESET_LAYOUTS[preset]
  return state.splitPercent === expected.splitPercent
    && state.drawerHeight === expected.drawerHeight
    && state.drawerOpen === expected.drawerOpen
    && state.activeDrawerTab === expected.activeDrawerTab
    && state.density === expected.density
}

export function normalizeWorkbenchLayout(value: unknown): WorkbenchLayoutState {
  if (!value || typeof value !== 'object') return { ...DEFAULT_WORKBENCH_LAYOUT }
  const candidate = value as Partial<WorkbenchLayoutState>

  const normalized = {
    splitPercent: clampSplitPercent(
      typeof candidate.splitPercent === 'number'
        ? candidate.splitPercent
        : DEFAULT_WORKBENCH_LAYOUT.splitPercent,
    ),
    drawerHeight: clampDrawerHeight(
      typeof candidate.drawerHeight === 'number'
        ? candidate.drawerHeight
        : DEFAULT_WORKBENCH_LAYOUT.drawerHeight,
    ),
    drawerOpen: typeof candidate.drawerOpen === 'boolean'
      ? candidate.drawerOpen
      : DEFAULT_WORKBENCH_LAYOUT.drawerOpen,
    activeDrawerTab: isDrawerTab(candidate.activeDrawerTab)
      ? candidate.activeDrawerTab
      : DEFAULT_WORKBENCH_LAYOUT.activeDrawerTab,
    density: isDensity(candidate.density)
      ? candidate.density
      : DEFAULT_WORKBENCH_LAYOUT.density,
    responsiveMode: isResponsiveMode(candidate.responsiveMode)
      ? candidate.responsiveMode
      : DEFAULT_WORKBENCH_LAYOUT.responsiveMode,
  }
  const requestedPreset = isWorkspacePreset(candidate.workspacePreset)
    ? candidate.workspacePreset
    : null

  return {
    ...normalized,
    workspacePreset: requestedPreset && matchesPreset(normalized, requestedPreset)
      ? requestedPreset
      : null,
  }
}

export function workbenchLayoutReducer(
  state: WorkbenchLayoutState,
  action: WorkbenchLayoutAction,
): WorkbenchLayoutState {
  switch (action.type) {
    case 'setSplit':
      return {
        ...state,
        splitPercent: clampSplitPercent(action.value),
        workspacePreset: null,
      }
    case 'resetSplit':
      return {
        ...state,
        splitPercent: DEFAULT_WORKBENCH_LAYOUT.splitPercent,
        workspacePreset: null,
      }
    case 'setDrawerHeight':
      return {
        ...state,
        drawerHeight: clampDrawerHeight(action.value),
        workspacePreset: null,
      }
    case 'openDrawer':
      return {
        ...state,
        drawerOpen: true,
        activeDrawerTab: action.tab ?? state.activeDrawerTab,
        workspacePreset: null,
      }
    case 'closeDrawer':
      return { ...state, drawerOpen: false, workspacePreset: null }
    case 'toggleDrawer':
      return state.drawerOpen && state.activeDrawerTab === action.tab
        ? { ...state, drawerOpen: false, workspacePreset: null }
        : {
            ...state,
            drawerOpen: true,
            activeDrawerTab: action.tab,
            workspacePreset: null,
          }
    case 'setDensity':
      return { ...state, density: action.density, workspacePreset: null }
    case 'setResponsiveMode':
      return { ...state, responsiveMode: action.mode }
    case 'applyPreset':
      return {
        ...state,
        ...WORKSPACE_PRESET_LAYOUTS[action.preset],
        workspacePreset: action.preset,
      }
  }
}
