import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { ControlIcon } from './ControlIcon'
import {
  calculatePopoverPosition,
  POPOVER_VIEWPORT_MARGIN,
  type PopoverPosition,
} from './control-popover-position'

interface Props {
  open: boolean
  label: string
  anchorRef?: RefObject<HTMLElement | null>
  positioning?: 'anchored' | 'viewport'
  preferredWidth?: number
  children: ReactNode
  onClose(): void
}

export function ControlPopover({
  open,
  label,
  anchorRef,
  positioning = 'viewport',
  preferredWidth,
  children,
  onClose,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<PopoverPosition | null>(null)
  const closePopover = useEffectEvent(onClose)

  useLayoutEffect(() => {
    if (!open || positioning !== 'viewport') return

    const anchor = anchorRef?.current
    if (!anchor) return
    const popover = popoverRef.current
    if (!popover) return
    const anchorStyles = window.getComputedStyle(anchor)
    for (let index = 0; index < anchorStyles.length; index += 1) {
      const property = anchorStyles.item(index)
      if (property.startsWith('--')) {
        popover.style.setProperty(
          property,
          anchorStyles.getPropertyValue(property),
        )
      }
    }
    popover.style.colorScheme = anchorStyles.colorScheme

    const updatePosition = () => {
      const popoverRect = popover.getBoundingClientRect()
      setPosition(calculatePopoverPosition(
        anchor.getBoundingClientRect(),
        {
          width: popoverRect.width,
          height: Math.max(popoverRect.height, popover.scrollHeight),
        },
        window.innerWidth,
        window.innerHeight,
      ))
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updatePosition)
    resizeObserver?.observe(anchor)
    resizeObserver?.observe(popover)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      resizeObserver?.disconnect()
    }
  }, [anchorRef, open, positioning])

  useEffect(() => {
    if (!open) return
    const anchor = anchorRef?.current

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closePopover()
      }
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (popoverRef.current?.contains(target)) return
      if (anchor?.contains(target)) return
      closePopover()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    const focusFrame = window.requestAnimationFrame(() => {
      popoverRef.current
        ?.querySelector<HTMLElement>('.control-popover-content input, .control-popover-content select, .control-popover-content button, .control-popover-content [tabindex]:not([tabindex="-1"])')
        ?.focus()
    })

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
      anchor?.focus()
    }
  }, [anchorRef, open])

  if (!open) return null

  const viewportPositioned = positioning === 'viewport'
  const canPosition = viewportPositioned && typeof document !== 'undefined'
  const style: CSSProperties | undefined = canPosition
    ? {
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        width: preferredWidth
          ? `min(${preferredWidth}px, calc(100vw - ${POPOVER_VIEWPORT_MARGIN * 2}px))`
          : undefined,
        maxHeight: position?.maxHeight,
        visibility: position ? 'visible' : 'hidden',
      }
    : undefined
  const popover = (
    <div
      ref={popoverRef}
      className={`control-popover${
        viewportPositioned ? ' control-popover--viewport' : ''
      }`}
      role="dialog"
      aria-label={label}
      data-placement={position?.placement}
      style={style}
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

  return canPosition ? createPortal(popover, document.body) : popover
}
