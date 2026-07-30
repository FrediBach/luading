import { useId, useRef } from 'react'
import { relativeEncoderSteps } from './control-math'

interface Props {
  label: string
  disabled?: boolean
  onTurn(direction: -1 | 1): void
}

function emitRelativeSteps(steps: number, onTurn: (direction: -1 | 1) => void) {
  const direction = steps < 0 ? -1 : 1
  for (let index = 0; index < Math.abs(steps); index += 1) onTurn(direction)
}

export function EndlessEncoder({
  label,
  disabled = false,
  onTurn,
}: Props) {
  const labelId = useId()
  const dragRef = useRef<{ lastY: number; remainder: number } | null>(null)

  return (
    <div className={`endless-encoder${disabled ? ' is-disabled' : ''}`}>
      <span id={labelId}>{label}</span>
      <div
        className="endless-encoder-dial"
        role="button"
        aria-roledescription="endless encoder"
        aria-labelledby={labelId}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(event) => {
          if (disabled) return
          if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
            event.preventDefault()
            onTurn(1)
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
            event.preventDefault()
            onTurn(-1)
          }
        }}
        onWheel={(event) => {
          if (disabled || event.deltaY === 0) return
          event.preventDefault()
          onTurn(event.deltaY < 0 ? 1 : -1)
        }}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0) return
          dragRef.current = { lastY: event.clientY, remainder: 0 }
          event.currentTarget.setPointerCapture(event.pointerId)
          event.currentTarget.focus()
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag || disabled) return
          const movement = drag.lastY - event.clientY + drag.remainder
          const steps = relativeEncoderSteps(movement)
          if (steps !== 0) emitRelativeSteps(steps, onTurn)
          dragRef.current = {
            lastY: event.clientY,
            remainder: movement - steps * 8,
          }
        }}
        onPointerUp={(event) => {
          dragRef.current = null
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null
        }}
      >
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="endless-encoder-ring" cx="50" cy="50" r="39" />
          <circle className="endless-encoder-face" cx="50" cy="50" r="29" />
          {Array.from({ length: 11 }, (_, index) => {
            const angle = (-120 + index * 24) * Math.PI / 180
            const x1 = 50 + Math.cos(angle) * 34
            const y1 = 50 + Math.sin(angle) * 34
            const x2 = 50 + Math.cos(angle) * 40
            const y2 = 50 + Math.sin(angle) * 40
            return (
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                key={index}
              />
            )
          })}
          <circle className="endless-encoder-centre" cx="50" cy="50" r="3" />
        </svg>
      </div>
    </div>
  )
}

