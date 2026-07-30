import {
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import {
  clampSplitPercent,
  type ResponsiveWorkbenchMode,
} from './workbench-layout'

interface Props {
  primary: ReactNode
  secondary: ReactNode
  splitPercent: number
  narrow: boolean
  responsiveMode: ResponsiveWorkbenchMode
  onSplitChange(value: number): void
  onSplitReset(): void
  onResponsiveModeChange(mode: ResponsiveWorkbenchMode): void
}

const RESPONSIVE_MODES: Array<{
  id: ResponsiveWorkbenchMode
  label: string
}> = [
  { id: 'editor', label: 'Editor' },
  { id: 'instrument', label: 'Instrument' },
]

export function SplitPane({
  primary,
  secondary,
  splitPercent,
  narrow,
  responsiveMode,
  onSplitChange,
  onSplitReset,
  onResponsiveModeChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const modeRefs = useRef<Array<HTMLButtonElement | null>>([])

  const updateFromPointer = (clientX: number) => {
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0) return
    onSplitChange(clampSplitPercent(
      ((clientX - bounds.left) / bounds.width) * 100,
    ))
  }

  const handleModeKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + RESPONSIVE_MODES.length) % RESPONSIVE_MODES.length
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % RESPONSIVE_MODES.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = RESPONSIVE_MODES.length - 1
    }
    if (nextIndex === null) return
    event.preventDefault()
    const nextMode = RESPONSIVE_MODES[nextIndex]
    if (!nextMode) return
    onResponsiveModeChange(nextMode.id)
    modeRefs.current[nextIndex]?.focus()
  }

  return (
    <div
      ref={containerRef}
      className="workbench-split"
      data-responsive-mode={responsiveMode}
      style={{
        '--workbench-primary-percent': `${splitPercent}%`,
      } as CSSProperties}
    >
      <div
        className="workbench-responsive-modes"
        role="tablist"
        aria-label="Workbench view"
      >
        {RESPONSIVE_MODES.map((mode, index) => (
          <button
            ref={(element) => {
              modeRefs.current[index] = element
            }}
            type="button"
            id={`workbench-responsive-tab-${mode.id}`}
            role="tab"
            aria-controls={`workbench-responsive-panel-${mode.id}`}
            aria-selected={responsiveMode === mode.id}
            tabIndex={responsiveMode === mode.id ? 0 : -1}
            onClick={() => onResponsiveModeChange(mode.id)}
            onKeyDown={(event) => handleModeKeyDown(event, index)}
            key={mode.id}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <section
        id="workbench-responsive-panel-editor"
        className="workbench-split-primary"
        role={narrow ? 'tabpanel' : undefined}
        aria-labelledby={narrow ? 'workbench-responsive-tab-editor' : undefined}
        aria-label={narrow ? undefined : 'Lua editor'}
        hidden={narrow && responsiveMode !== 'editor'}
      >
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
      <section
        id="workbench-responsive-panel-instrument"
        className="workbench-split-secondary"
        role={narrow ? 'tabpanel' : undefined}
        aria-labelledby={narrow ? 'workbench-responsive-tab-instrument' : undefined}
        aria-label={narrow ? undefined : 'Disting instrument'}
        hidden={narrow && responsiveMode !== 'instrument'}
      >
        {secondary}
      </section>
    </div>
  )
}
