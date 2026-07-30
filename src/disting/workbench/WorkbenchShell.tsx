import type { ReactNode } from 'react'
import type { EffectiveWorkbenchDensity } from './useWorkbenchViewport'

interface Props {
  commandBar: ReactNode
  workspace: ReactNode
  drawer: ReactNode
  statusBar: ReactNode
  density: EffectiveWorkbenchDensity
  announcement?: string
}

export function WorkbenchShell({
  commandBar,
  workspace,
  drawer,
  statusBar,
  density,
  announcement,
}: Props) {
  return (
    <main className="disting-app workbench-shell" data-density={density}>
      <div
        className="workbench-announcer"
        role="alert"
        aria-atomic="true"
      >
        {announcement}
      </div>
      {commandBar}
      <div className="workbench-body">
        {workspace}
        {drawer}
      </div>
      {statusBar}
    </main>
  )
}
