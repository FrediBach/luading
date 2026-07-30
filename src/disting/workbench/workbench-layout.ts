export type DrawerTabId = 'scope' | 'problems' | 'console' | 'performance'
export type WorkbenchDensity = 'compact' | 'comfortable'

export interface WorkbenchLayoutState {
  splitPercent: number
  drawerHeight: number
  drawerOpen: boolean
  activeDrawerTab: DrawerTabId
  density: WorkbenchDensity
}

export type WorkbenchLayoutAction =
  | { type: 'setSplit'; value: number }
  | { type: 'resetSplit' }
  | { type: 'setDrawerHeight'; value: number }
  | { type: 'openDrawer'; tab?: DrawerTabId }
  | { type: 'closeDrawer' }
  | { type: 'toggleDrawer'; tab: DrawerTabId }
  | { type: 'setDensity'; density: WorkbenchDensity }

export const DEFAULT_WORKBENCH_LAYOUT: WorkbenchLayoutState = {
  splitPercent: 60,
  drawerHeight: 220,
  drawerOpen: true,
  activeDrawerTab: 'scope',
  density: 'compact',
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

export function normalizeWorkbenchLayout(value: unknown): WorkbenchLayoutState {
  if (!value || typeof value !== 'object') return { ...DEFAULT_WORKBENCH_LAYOUT }
  const candidate = value as Partial<WorkbenchLayoutState>

  return {
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
  }
}

export function workbenchLayoutReducer(
  state: WorkbenchLayoutState,
  action: WorkbenchLayoutAction,
): WorkbenchLayoutState {
  switch (action.type) {
    case 'setSplit':
      return { ...state, splitPercent: clampSplitPercent(action.value) }
    case 'resetSplit':
      return { ...state, splitPercent: DEFAULT_WORKBENCH_LAYOUT.splitPercent }
    case 'setDrawerHeight':
      return { ...state, drawerHeight: clampDrawerHeight(action.value) }
    case 'openDrawer':
      return {
        ...state,
        drawerOpen: true,
        activeDrawerTab: action.tab ?? state.activeDrawerTab,
      }
    case 'closeDrawer':
      return { ...state, drawerOpen: false }
    case 'toggleDrawer':
      return state.drawerOpen && state.activeDrawerTab === action.tab
        ? { ...state, drawerOpen: false }
        : { ...state, drawerOpen: true, activeDrawerTab: action.tab }
    case 'setDensity':
      return { ...state, density: action.density }
  }
}

