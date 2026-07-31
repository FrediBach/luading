export interface DisplayPosition {
  x: number
  y: number
}

interface Size {
  width: number
  height: number
}

export function clampDisplayPosition(
  position: DisplayPosition,
  overlay: Size,
  viewport: Size,
  margin: number,
): DisplayPosition {
  return {
    x: Math.min(
      Math.max(margin, position.x),
      Math.max(margin, viewport.width - overlay.width - margin),
    ),
    y: Math.min(
      Math.max(margin, position.y),
      Math.max(margin, viewport.height - overlay.height - margin),
    ),
  }
}
