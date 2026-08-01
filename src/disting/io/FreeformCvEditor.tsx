import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { ValueField } from '../controls'
import {
  DEFAULT_FREEFORM_CV_POINTS,
  FREEFORM_CV_MAX_POINTS,
  FREEFORM_CV_MAX_VOLTS,
  FREEFORM_CV_MIN_VOLTS,
} from '../emulation/signal-sources'
import type { FreeformCvPoint } from '../types'
import {
  addFreeformCvPoint,
  addFreeformCvPointInLargestGap,
  FREEFORM_CV_PHASE_FINE_STEP,
  FREEFORM_CV_PHASE_STEP,
  FREEFORM_CV_VOLTS_FINE_STEP,
  FREEFORM_CV_VOLTS_STEP,
  freeformCvPath,
  freeformCvPointFromClient,
  freeformCvPointPosition,
  moveFreeformCvPoint,
  removeFreeformCvPoint,
  type FreeformCvPointEdit,
} from './freeform-cv-editor'

interface Props {
  points: readonly FreeformCvPoint[]
  onChange(points: FreeformCvPoint[]): void
}

const PLOT_WIDTH = 420
const PLOT_HEIGHT = 176

function pointLabel(point: FreeformCvPoint, index: number) {
  return `Point ${index + 1}, ${(point.phase * 100).toFixed(1)} percent, ${point.volts.toFixed(2)} volts`
}

export function FreeformCvEditor({ points, onChange }: Props) {
  const [draftPoints, setDraftPoints] = useState(() => points.map((point) => ({ ...point })))
  const [sourcePoints, setSourcePoints] = useState(points)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [activePointer, setActivePointer] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const pointRefs = useRef<Array<SVGGElement | null>>([])
  const draftRef = useRef(draftPoints)
  const activePointerRef = useRef<number | null>(null)
  const activePointIndexRef = useRef(0)
  const scheduledFrameRef = useRef<number | null>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  if (points !== sourcePoints && activePointer === null) {
    const next = points.map((point) => ({ ...point }))
    setSourcePoints(points)
    setDraftPoints(next)
    setSelectedIndex((current) => Math.min(current, Math.max(0, next.length - 1)))
  }

  useEffect(() => {
    draftRef.current = draftPoints
  }, [draftPoints])

  useEffect(() => () => {
    if (scheduledFrameRef.current !== null) {
      window.cancelAnimationFrame(scheduledFrameRef.current)
    }
  }, [])

  const publish = (next: FreeformCvPoint[], immediate: boolean) => {
    draftRef.current = next
    setDraftPoints(next)
    if (immediate) {
      if (scheduledFrameRef.current !== null) {
        window.cancelAnimationFrame(scheduledFrameRef.current)
        scheduledFrameRef.current = null
      }
      onChangeRef.current(next)
      return
    }
    if (scheduledFrameRef.current !== null) return
    scheduledFrameRef.current = window.requestAnimationFrame(() => {
      scheduledFrameRef.current = null
      onChangeRef.current(draftRef.current)
    })
  }

  const applyEdit = (edit: FreeformCvPointEdit, focusPoint = false, immediate = true) => {
    setSelectedIndex(edit.selectedIndex)
    if (edit.changed) publish(edit.points, immediate)
    if (focusPoint) {
      window.requestAnimationFrame(() => pointRefs.current[edit.selectedIndex]?.focus())
    }
  }

  const eventPoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return freeformCvPointFromClient(event.clientX, event.clientY, bounds)
  }

  const finishPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerId !== activePointerRef.current) return
    activePointerRef.current = null
    setActivePointer(null)
    if (scheduledFrameRef.current !== null) {
      window.cancelAnimationFrame(scheduledFrameRef.current)
      scheduledFrameRef.current = null
    }
    onChangeRef.current(draftRef.current)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handlePointKey = (
    event: ReactKeyboardEvent<SVGGElement>,
    index: number,
  ) => {
    setSelectedIndex(index)
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      applyEdit(removeFreeformCvPoint(draftRef.current, index), true)
      return
    }
    const point = draftRef.current[index]
    if (!point) return
    const phaseStep = event.shiftKey ? FREEFORM_CV_PHASE_FINE_STEP : FREEFORM_CV_PHASE_STEP
    const voltsStep = event.shiftKey ? FREEFORM_CV_VOLTS_FINE_STEP : FREEFORM_CV_VOLTS_STEP
    let next: FreeformCvPoint | null = null
    if (event.key === 'ArrowLeft') next = { ...point, phase: point.phase - phaseStep }
    if (event.key === 'ArrowRight') next = { ...point, phase: point.phase + phaseStep }
    if (event.key === 'ArrowUp') next = { ...point, volts: point.volts + voltsStep }
    if (event.key === 'ArrowDown') next = { ...point, volts: point.volts - voltsStep }
    if (!next) return
    event.preventDefault()
    applyEdit(moveFreeformCvPoint(draftRef.current, index, next))
  }

  const selected = draftPoints[selectedIndex] ?? draftPoints[0]
  const isBoundary = selectedIndex === 0 || selectedIndex === draftPoints.length - 1
  const atPointLimit = draftPoints.length >= FREEFORM_CV_MAX_POINTS
  const curvePath = freeformCvPath(draftPoints, PLOT_WIDTH, PLOT_HEIGHT)
  const zeroY = freeformCvPointPosition({ phase: 0, volts: 0 }, PLOT_WIDTH, PLOT_HEIGHT).y

  return (
    <section className="freeform-cv-editor" aria-labelledby="freeform-cv-editor-heading">
      <div className="freeform-cv-editor-heading">
        <div>
          <h3 id="freeform-cv-editor-heading">Freeform waveform</h3>
          <p id="freeform-cv-editor-help">Click or tap to add; drag a point to move.</p>
        </div>
        <span>{draftPoints.length}/{FREEFORM_CV_MAX_POINTS} points</span>
      </div>

      <svg
        ref={svgRef}
        className="freeform-cv-plot"
        viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
        role="group"
        aria-label="Freeform CV waveform editor"
        aria-describedby="freeform-cv-editor-help"
        preserveAspectRatio="none"
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return
          applyEdit(addFreeformCvPoint(draftRef.current, eventPoint(event)), true)
        }}
        onPointerMove={(event) => {
          if (event.pointerId !== activePointerRef.current) return
          applyEdit(
            moveFreeformCvPoint(draftRef.current, activePointIndexRef.current, eventPoint(event)),
            false,
            false,
          )
        }}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onLostPointerCapture={finishPointer}
      >
        <line className="freeform-cv-grid freeform-cv-grid--zero" x1="0" x2={PLOT_WIDTH} y1={zeroY} y2={zeroY} />
        {[0.25, 0.5, 0.75].map((phase) => (
          <line
            className="freeform-cv-grid"
            x1={phase * PLOT_WIDTH}
            x2={phase * PLOT_WIDTH}
            y1="0"
            y2={PLOT_HEIGHT}
            key={phase}
          />
        ))}
        <path className="freeform-cv-path" d={curvePath} />
        {draftPoints.map((point, index) => {
          const position = freeformCvPointPosition(point, PLOT_WIDTH, PLOT_HEIGHT)
          return (
            <g
              ref={(node) => { pointRefs.current[index] = node }}
              className={`freeform-cv-point${selectedIndex === index ? ' is-selected' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={pointLabel(point, index)}
              aria-pressed={selectedIndex === index}
              transform={`translate(${position.x} ${position.y})`}
              key={index}
              onFocus={() => setSelectedIndex(index)}
              onKeyDown={(event) => handlePointKey(event, index)}
              onPointerDown={(event) => {
                event.stopPropagation()
                event.preventDefault()
                setSelectedIndex(index)
                activePointIndexRef.current = index
                activePointerRef.current = event.pointerId
                setActivePointer(event.pointerId)
                svgRef.current?.setPointerCapture(event.pointerId)
              }}
            >
              <circle className="freeform-cv-point-hit" r="13" />
              <circle className="freeform-cv-point-marker" r="4.5" />
            </g>
          )
        })}
        <text className="freeform-cv-axis-label" x="4" y="13">+10 V</text>
        <text className="freeform-cv-axis-label" x="4" y={PLOT_HEIGHT - 5}>-10 V</text>
        <text className="freeform-cv-axis-label" x={PLOT_WIDTH - 4} y={PLOT_HEIGHT - 5} textAnchor="end">1 cycle</text>
      </svg>

      {selected && (
        <div className="freeform-cv-point-fields">
          <span>Point {selectedIndex + 1}</span>
          <ValueField
            label={`Point ${selectedIndex + 1} phase`}
            value={selected.phase * 100}
            min={0}
            max={100}
            step={0.1}
            unit="%"
            disabled={isBoundary}
            onChange={(phasePercent) => applyEdit(moveFreeformCvPoint(
              draftRef.current,
              selectedIndex,
              { ...selected, phase: phasePercent / 100 },
            ))}
          />
          <ValueField
            label={`Point ${selectedIndex + 1} voltage`}
            value={selected.volts}
            min={FREEFORM_CV_MIN_VOLTS}
            max={FREEFORM_CV_MAX_VOLTS}
            step={0.01}
            unit="V"
            onChange={(volts) => applyEdit(moveFreeformCvPoint(
              draftRef.current,
              selectedIndex,
              { ...selected, volts },
            ))}
          />
        </div>
      )}

      <div className="freeform-cv-actions">
        <button
          type="button"
          disabled={atPointLimit}
          aria-describedby={atPointLimit ? 'freeform-cv-limit' : undefined}
          onClick={() => applyEdit(addFreeformCvPointInLargestGap(draftRef.current), true)}
        >
          Add point
        </button>
        <button
          type="button"
          disabled={isBoundary}
          onClick={() => applyEdit(removeFreeformCvPoint(draftRef.current, selectedIndex), true)}
        >
          Remove point
        </button>
        <button
          type="button"
          onClick={() => {
            const next = DEFAULT_FREEFORM_CV_POINTS.map((point) => ({ ...point }))
            setSelectedIndex(0)
            publish(next, true)
            window.requestAnimationFrame(() => pointRefs.current[0]?.focus())
          }}
        >
          Reset waveform
        </button>
      </div>
      {atPointLimit && <p id="freeform-cv-limit" role="status">64 point limit reached. Move or remove a point to continue.</p>}
      {activePointer !== null && <span className="freeform-cv-drag-status" aria-hidden="true">Editing point</span>}
    </section>
  )
}
