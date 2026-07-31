import type { ReactNode } from 'react'
import type { ThemeMode } from '../theme'
import type { EffectiveWorkbenchDensity } from './useWorkbenchViewport'

interface Props {
  commandBar: ReactNode
  workspace: ReactNode
  drawer: ReactNode
  statusBar: ReactNode
  overlay?: ReactNode
  density: EffectiveWorkbenchDensity
  theme: ThemeMode
  announcement?: string
}

export function WorkbenchShell({
  commandBar,
  workspace,
  drawer,
  statusBar,
  overlay,
  density,
  theme,
  announcement,
}: Props) {
  return (
    <main
      className="disting-app workbench-shell"
      data-density={density}
      data-theme={theme}
    >
      <div
        className="workbench-announcer"
        role="alert"
        aria-atomic="true"
      >
        {announcement}
      </div>
      {overlay}
      {commandBar}
      <div className="workbench-body">
        {workspace}
        {drawer}
      </div>
      {statusBar}
    </main>
  )
}
