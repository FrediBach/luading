import { useEffect, useState } from 'react'
import type { WorkbenchDensity } from './workbench-layout'

export type EffectiveWorkbenchDensity = WorkbenchDensity | 'touch'

const NARROW_WORKBENCH_QUERY = '(max-width: 899px)'
const TOUCH_ORIENTED_QUERY = '(pointer: coarse)'

function queryMatches(query: string) {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(query).matches
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => queryMatches(query))

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mediaQuery = window.matchMedia(query)
    const update = () => setMatches(mediaQuery.matches)
    update()
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [query])

  return matches
}

export function resolveWorkbenchDensity(
  density: WorkbenchDensity,
  touchOriented: boolean,
): EffectiveWorkbenchDensity {
  return touchOriented ? 'touch' : density
}

export function useWorkbenchViewport() {
  const narrow = useMediaQuery(NARROW_WORKBENCH_QUERY)
  const touchOriented = useMediaQuery(TOUCH_ORIENTED_QUERY)

  return { narrow, touchOriented }
}
