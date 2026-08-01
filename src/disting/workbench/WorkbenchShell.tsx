import type { ReactNode } from 'react'
import type { ThemeMode } from '../theme'
import type { TextSize } from '../appearance'
import type { EffectiveWorkbenchDensity } from './useWorkbenchViewport'

interface Props {
  commandBar: ReactNode
  workspace: ReactNode
  drawer: ReactNode
  statusBar: ReactNode
  density: EffectiveWorkbenchDensity
  theme: ThemeMode
  textSize: TextSize
  announcement?: string
}

export function WorkbenchShell({
  commandBar,
  workspace,
  drawer,
  statusBar,
  density,
  theme,
  textSize,
  announcement,
}: Props) {
  return (
    <main
      className="disting-app workbench-shell"
      data-density={density}
      data-theme={theme}
      data-text-size={textSize}
    >
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
