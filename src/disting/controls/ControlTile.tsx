import {
  forwardRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'

interface Props {
  label: string
  meta?: string
  visual: ReactNode
  value: ReactNode
  actions?: ReactNode
  footerAction?: ReactNode
  footer?: ReactNode
  selected?: boolean
  status?: 'default' | 'warning' | 'error'
  onActivate?(): void
}

function isInteractiveTarget(target: EventTarget) {
  return target instanceof Element
    && Boolean(target.closest('button, input, select, textarea, a, [role="slider"]'))
}

export const ControlTile = forwardRef<HTMLElement, Props>(function ControlTile({
  label,
  meta,
  visual,
  value,
  actions,
  footerAction,
  footer,
  selected = false,
  status = 'default',
  onActivate,
}, ref) {
  const activateFromClick = (event: MouseEvent<HTMLElement>) => {
    if (!onActivate || isInteractiveTarget(event.target)) return
    onActivate()
  }
  const activateFromKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (!onActivate || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onActivate()
  }

  return (
    <article
      ref={ref}
      className={`control-tile control-tile--${status}${selected ? ' is-selected' : ''}`}
      tabIndex={onActivate ? 0 : undefined}
      role={onActivate ? 'button' : undefined}
      aria-label={onActivate ? `Open ${label} settings` : undefined}
      onClick={activateFromClick}
      onKeyDown={activateFromKeyboard}
    >
      <header>
        <span>{label}</span>
        {meta && <small>{meta}</small>}
      </header>
      {actions && <div className="control-tile-actions">{actions}</div>}
      {footerAction && (
        <div className="control-tile-footer-action">{footerAction}</div>
      )}
      <div className="control-tile-visual">{visual}</div>
      <div className="control-tile-value">{value}</div>
      {footer && <footer>{footer}</footer>}
    </article>
  )
})
