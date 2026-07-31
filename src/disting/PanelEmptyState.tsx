import type { ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
}

export function PanelEmptyState({ title, children }: Props) {
  return (
    <div className="panel-empty-state">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  )
}
