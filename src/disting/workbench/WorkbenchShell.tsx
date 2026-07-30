import type { ReactNode } from 'react'

interface Props {
  commandBar: ReactNode
  workspace: ReactNode
  drawer: ReactNode
  statusBar: ReactNode
  density: 'compact' | 'comfortable'
}

export function WorkbenchShell({
  commandBar,
  workspace,
  drawer,
  statusBar,
  density,
}: Props) {
  return (
    <main className="disting-app workbench-shell" data-density={density}>
      {commandBar}
      <div className="workbench-body">
        {workspace}
        {drawer}
      </div>
      {statusBar}
    </main>
  )
}

