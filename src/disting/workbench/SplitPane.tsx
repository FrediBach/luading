import { useRef, type CSSProperties, type ReactNode } from 'react'
import { clampSplitPercent } from './workbench-layout'

interface Props {
  primary: ReactNode
  secondary: ReactNode
  splitPercent: number
  onSplitChange(value: number): void
  onSplitReset(): void
}

export function SplitPane({
  primary,
  secondary,
  splitPercent,
  onSplitChange,
  onSplitReset,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const updateFromPointer = (clientX: number) => {
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0) return
    onSplitChange(clampSplitPercent(
      ((clientX - bounds.left) / bounds.width) * 100,
    ))
  }

  return (
    <div
      ref={containerRef}
      className="workbench-split"
      style={{
        '--workbench-primary-percent': `${splitPercent}%`,
      } as CSSProperties}
    >
      <section className="workbench-split-primary" aria-label="Lua editor">
        {primary}
      </section>
      <div
        className="workbench-split-divider"
        role="separator"
        aria-label="Resize editor and instrument"
        aria-orientation="vertical"
        aria-valuemin={38}
        aria-valuemax={72}
        aria-valuenow={Math.round(splitPercent)}
        tabIndex={0}
        onDoubleClick={onSplitReset}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 5 : 2
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            onSplitChange(splitPercent - step)
          } else if (event.key === 'ArrowRight') {
            event.preventDefault()
            onSplitChange(splitPercent + step)
          } else if (event.key === 'Home') {
            event.preventDefault()
            onSplitChange(38)
          } else if (event.key === 'End') {
            event.preventDefault()
            onSplitChange(72)
          }
        }}
        onPointerDown={(event) => {
          draggingRef.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
          updateFromPointer(event.clientX)
        }}
        onPointerMove={(event) => {
          if (draggingRef.current) updateFromPointer(event.clientX)
        }}
        onPointerUp={(event) => {
          draggingRef.current = false
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
        }}
        onPointerCancel={() => {
          draggingRef.current = false
        }}
        onLostPointerCapture={() => {
          draggingRef.current = false
        }}
      />
      <section className="workbench-split-secondary" aria-label="Disting instrument">
        {secondary}
      </section>
    </div>
  )
}
