interface PopoverRect {
  top: number
  right: number
  bottom: number
}

interface PopoverSize {
  width: number
  height: number
}

export interface PopoverPosition {
  top: number
  left: number
  maxHeight: number
  placement: 'above' | 'below'
}

const POPOVER_GAP = 6
export const POPOVER_VIEWPORT_MARGIN = 8
const MAX_POPOVER_HEIGHT = 480

export function calculatePopoverPosition(
  anchor: PopoverRect,
  popover: PopoverSize,
  viewportWidth: number,
  viewportHeight: number,
): PopoverPosition {
  const availableBelow = Math.max(
    0,
    viewportHeight
      - anchor.bottom
      - POPOVER_GAP
      - POPOVER_VIEWPORT_MARGIN,
  )
  const availableAbove = Math.max(
    0,
    anchor.top - POPOVER_GAP - POPOVER_VIEWPORT_MARGIN,
  )
  const desiredHeight = Math.min(popover.height, MAX_POPOVER_HEIGHT)
  const placement = availableBelow >= desiredHeight
    || availableBelow >= availableAbove
    ? 'below'
    : 'above'
  const availableHeight = placement === 'below'
    ? availableBelow
    : availableAbove
  const maxHeight = Math.min(MAX_POPOVER_HEIGHT, availableHeight)
  const renderedHeight = Math.min(desiredHeight, maxHeight)
  const unclampedLeft = anchor.right - popover.width
  const maximumLeft = Math.max(
    POPOVER_VIEWPORT_MARGIN,
    viewportWidth - popover.width - POPOVER_VIEWPORT_MARGIN,
  )

  return {
    top: placement === 'below'
      ? anchor.bottom + POPOVER_GAP
      : anchor.top - POPOVER_GAP - renderedHeight,
    left: Math.min(
      Math.max(unclampedLeft, POPOVER_VIEWPORT_MARGIN),
      maximumLeft,
    ),
    maxHeight,
    placement,
  }
}
