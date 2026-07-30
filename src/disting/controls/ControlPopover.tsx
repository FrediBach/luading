import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { ControlIcon } from './ControlIcon'

interface Props {
  open: boolean
  label: string
  anchorRef?: RefObject<HTMLElement | null>
  children: ReactNode
  onClose(): void
}

export function ControlPopover({
  open,
  label,
  anchorRef,
  children,
  onClose,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const anchor = anchorRef?.current

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (popoverRef.current?.contains(target)) return
      if (anchor?.contains(target)) return
      onClose()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    window.requestAnimationFrame(() => {
      popoverRef.current
        ?.querySelector<HTMLElement>('.control-popover-content input, .control-popover-content select, .control-popover-content button, .control-popover-content [tabindex]:not([tabindex="-1"])')
        ?.focus()
    })

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
      anchor?.focus()
    }
  }, [anchorRef, onClose, open])

  if (!open) return null

  return (
    <div
      ref={popoverRef}
      className="control-popover"
      role="dialog"
      aria-label={label}
    >
      <div className="control-popover-heading">
        <strong>{label}</strong>
        <button type="button" aria-label={`Close ${label}`} onClick={onClose}>
          <ControlIcon name="close" size={14} />
        </button>
      </div>
      <div className="control-popover-content">{children}</div>
    </div>
  )
}
