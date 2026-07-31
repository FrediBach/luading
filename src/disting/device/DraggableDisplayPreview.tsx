import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import type { DrawCommand } from '../types'
import { DistingDisplayBezel } from './DistingDisplayBezel'
import {
  clampDisplayPosition,
  positionDisplayAtBottomRight,
  type DisplayPosition,
} from './display-position'

const VIEWPORT_MARGIN = 8
const ANCHOR_SPACING = 12
const KEYBOARD_DRAG_STEP = 10

interface Props {
  commands: DrawCommand[]
  anchorRef: RefObject<HTMLElement | null>
}

export function DraggableDisplayPreview({
  commands,
  anchorRef,
}: Props) {
  const overlayRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{
    pointerId: number
    pointerX: number
    pointerY: number
    origin: DisplayPosition
  } | null>(null)
  const [position, setPosition] = useState<DisplayPosition | null>(null)
  const [doubleSize, setDoubleSize] = useState(false)
  const clampedPosition = useCallback((nextPosition: DisplayPosition) => {
    const overlay = overlayRef.current
    if (!overlay) return nextPosition
    return clampDisplayPosition(
      nextPosition,
      { width: overlay.offsetWidth, height: overlay.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      VIEWPORT_MARGIN,
    )
  }, [])

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const overlay = overlayRef.current
    if (!anchor || !overlay) return
    const anchorBounds = anchor.getBoundingClientRect()
    if (anchorBounds.width <= 0 || anchorBounds.height <= 0) return
    setPosition(clampedPosition(positionDisplayAtBottomRight(
      anchorBounds,
      { width: overlay.offsetWidth, height: overlay.offsetHeight },
      ANCHOR_SPACING,
    )))
  }, [anchorRef, clampedPosition])

  useEffect(() => {
    const keepInsideViewport = () => {
      setPosition((current) => current ? clampedPosition(current) : current)
    }
    const resizeObserver = new ResizeObserver(keepInsideViewport)
    const overlay = overlayRef.current
    if (overlay) resizeObserver.observe(overlay)
    window.addEventListener('resize', keepInsideViewport)
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', keepInsideViewport)
    }
  }, [clampedPosition])

  const beginDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    const bounds = overlayRef.current?.getBoundingClientRect()
    if (!bounds) return
    dragRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      origin: { x: bounds.left, y: bounds.top },
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const drag = (event: PointerEvent<HTMLButtonElement>) => {
    const activeDrag = dragRef.current
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return
    setPosition(clampedPosition({
      x: activeDrag.origin.x + event.clientX - activeDrag.pointerX,
      y: activeDrag.origin.y + event.clientY - activeDrag.pointerY,
    }))
  }

  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const moveWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    }[event.key]
    if (!direction) return
    const bounds = overlayRef.current?.getBoundingClientRect()
    if (!bounds) return
    const step = event.shiftKey ? 1 : KEYBOARD_DRAG_STEP
    setPosition(clampedPosition({
      x: bounds.left + direction.x * step,
      y: bounds.top + direction.y * step,
    }))
    event.preventDefault()
  }

  return (
    <section
      ref={overlayRef}
      className={`draggable-display-preview${doubleSize ? ' is-double-size' : ''}`}
      aria-label="Draggable Disting NT display preview"
      style={position ? { left: position.x, top: position.y } : undefined}
    >
      <header className="draggable-display-header">
        <button
          type="button"
          className="draggable-display-handle"
          aria-label="Move display preview. Use arrow keys or drag."
          onPointerDown={beginDrag}
          onPointerMove={drag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={moveWithKeyboard}
        >
          <span aria-hidden="true">⠿</span>
          Display preview
        </button>
        <button
          type="button"
          className="display-scale-switch"
          role="switch"
          aria-label="Render display at 2x"
          aria-checked={doubleSize}
          onClick={() => setDoubleSize((current) => !current)}
        >
          2x
        </button>
      </header>
      <DistingDisplayBezel commands={commands} />
    </section>
  )
}
