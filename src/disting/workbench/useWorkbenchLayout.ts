import { useEffect, useReducer } from 'react'
import {
  DEFAULT_WORKBENCH_LAYOUT,
  normalizeWorkbenchLayout,
  WORKBENCH_LAYOUT_STORAGE_KEY,
  workbenchLayoutReducer,
} from './workbench-layout'

function loadWorkbenchLayout() {
  if (typeof window === 'undefined') return DEFAULT_WORKBENCH_LAYOUT

  try {
    const saved = window.localStorage.getItem(WORKBENCH_LAYOUT_STORAGE_KEY)
    return saved
      ? normalizeWorkbenchLayout(JSON.parse(saved))
      : DEFAULT_WORKBENCH_LAYOUT
  } catch {
    return DEFAULT_WORKBENCH_LAYOUT
  }
}

export function useWorkbenchLayout() {
  const [layout, dispatch] = useReducer(
    workbenchLayoutReducer,
    undefined,
    loadWorkbenchLayout,
  )

  useEffect(() => {
    try {
      window.localStorage.setItem(
        WORKBENCH_LAYOUT_STORAGE_KEY,
        JSON.stringify(layout),
      )
    } catch {
      // The workbench remains usable when storage is unavailable.
    }
  }, [layout])

  return { layout, dispatch }
}

