import { useId, type ReactNode } from 'react'

interface Props {
  content: string
  children: ReactNode
  placement?: 'top' | 'right' | 'bottom' | 'left'
}

export function Tooltip({ content, children, placement = 'top' }: Props) {
  const id = useId()

  return (
    <span className="control-tooltip" data-placement={placement}>
      <span className="control-tooltip-anchor" aria-describedby={id}>
        {children}
      </span>
      <span className="control-tooltip-content" id={id} role="tooltip">
        {content}
      </span>
    </span>
  )
}

