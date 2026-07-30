import { useId, useRef, type CSSProperties } from 'react'
import {
  controlValueToAngle,
  keyboardAdjustedValue,
  valueFromVerticalDrag,
} from './control-math'
import { ValueField } from './ValueField'

interface Props {
  label: string
  value: number
  min: number
  max: number
  step?: number
  defaultValue?: number
  unit?: string
  disabled?: boolean
  bipolar?: boolean
  size?: 'small' | 'medium' | 'large'
  formatValue?(value: number): string
  onChange(value: number): void
}

function pointOnArc(angle: number, radius: number) {
  const radians = (angle - 90) * Math.PI / 180
  return {
    x: 50 + radius * Math.cos(radians),
    y: 50 + radius * Math.sin(radians),
  }
}

function arcPath(startAngle: number, endAngle: number, radius = 39) {
  const start = pointOnArc(startAngle, radius)
  const end = pointOnArc(endAngle, radius)
  const sweep = Math.max(0, endAngle - startAngle)
  const largeArc = sweep > 180 ? 1 : 0
  return `M${start.x.toFixed(2)},${start.y.toFixed(2)} A${radius},${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)},${end.y.toFixed(2)}`
}

function defaultStep(min: number, max: number) {
  return (max - min) / 100
}

function defaultFormat(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2)
}

export function RotaryControl({
  label,
  value,
  min,
  max,
  step = defaultStep(min, max),
  defaultValue,
  unit,
  disabled = false,
  bipolar = min < 0 && max > 0,
  size = 'medium',
  formatValue = defaultFormat,
  onChange,
}: Props) {
  const labelId = useId()
  const dragRef = useRef<{ startY: number; startValue: number } | null>(null)
  const angle = controlValueToAngle(value, min, max)
  const indicator = pointOnArc(angle, 29)
  const activeStart = bipolar ? controlValueToAngle(0, min, max) : -135
  const activeFrom = Math.min(activeStart, angle)
  const activeTo = Math.max(activeStart, angle)

  return (
    <div
      className={`rotary-control rotary-control--${size}${disabled ? ' is-disabled' : ''}`}
      style={{ '--rotary-angle': `${angle}deg` } as CSSProperties}
    >
      <span className="rotary-control-label" id={labelId}>{label}</span>
      <div
        className="rotary-control-dial"
        role="slider"
        aria-labelledby={labelId}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${formatValue(value)}${unit ? ` ${unit}` : ''}`}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onDoubleClick={() => {
          if (defaultValue !== undefined && !disabled) onChange(defaultValue)
        }}
        onKeyDown={(event) => {
          if (disabled) return
          const adjusted = keyboardAdjustedValue(
            value,
            event.key,
            min,
            max,
            step,
          )
          if (adjusted === null) return
          event.preventDefault()
          onChange(adjusted)
        }}
        onWheel={(event) => {
          if (disabled || event.deltaY === 0) return
          event.preventDefault()
          const adjusted = keyboardAdjustedValue(
            value,
            event.deltaY < 0 ? 'ArrowUp' : 'ArrowDown',
            min,
            max,
            step,
          )
          if (adjusted !== null) onChange(adjusted)
        }}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0) return
          dragRef.current = { startY: event.clientY, startValue: value }
          event.currentTarget.setPointerCapture(event.pointerId)
          event.currentTarget.focus()
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag || disabled) return
          onChange(valueFromVerticalDrag(
            drag.startValue,
            drag.startY - event.clientY,
            min,
            max,
            step,
            event.shiftKey,
          ))
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
          <path className="rotary-control-track" d={arcPath(-135, 135)} />
          {activeTo - activeFrom > 0.01 && (
            <path className="rotary-control-active" d={arcPath(activeFrom, activeTo)} />
          )}
          <circle className="rotary-control-face" cx="50" cy="50" r="29" />
          <line
            className="rotary-control-indicator"
            x1="50"
            y1="50"
            x2={indicator.x}
            y2={indicator.y}
          />
          {bipolar && (
            <line
              className="rotary-control-centre"
              x1="50"
              y1="7"
              x2="50"
              y2="13"
            />
          )}
        </svg>
      </div>
      <ValueField
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        unit={unit}
        disabled={disabled}
        formatValue={formatValue}
        onChange={onChange}
      />
    </div>
  )
}

