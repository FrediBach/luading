import { useRef, useState } from 'react'
import { parseControlValue } from './control-math'

interface Props {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  disabled?: boolean
  formatValue?(value: number): string
  parseValue?(text: string): number | null
  onChange(value: number): void
}

function defaultFormat(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2)
}

export function ValueField({
  label,
  value,
  min,
  max,
  step = 0,
  unit = '',
  disabled = false,
  formatValue = defaultFormat,
  parseValue,
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [invalid, setInvalid] = useState(false)

  const beginEditing = () => {
    if (disabled) return
    setDraft(formatValue(value))
    setInvalid(false)
    setEditing(true)
    window.requestAnimationFrame(() => inputRef.current?.select())
  }

  const commit = () => {
    const parsed = parseValue
      ? parseValue(draft)
      : parseControlValue(draft, min, max, step)
    if (parsed === null || !Number.isFinite(parsed)) {
      setInvalid(true)
      return false
    }
    onChange(parsed)
    setInvalid(false)
    setEditing(false)
    return true
  }

  if (editing) {
    return (
      <span className={`control-value-field is-editing${invalid ? ' is-invalid' : ''}`}>
        <input
          ref={inputRef}
          aria-label={`${label} exact value`}
          aria-invalid={invalid}
          value={draft}
          inputMode="decimal"
          onChange={(event) => {
            setDraft(event.target.value)
            setInvalid(false)
          }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              setEditing(false)
              setInvalid(false)
            }
          }}
          onBlur={() => {
            if (!commit()) {
              setEditing(false)
              setInvalid(false)
            }
          }}
        />
        {unit && <span>{unit}</span>}
      </span>
    )
  }

  return (
    <button
      type="button"
      className="control-value-field"
      aria-label={`${label}: ${formatValue(value)}${unit ? ` ${unit}` : ''}. Edit exact value.`}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        beginEditing()
      }}
    >
      <output>{formatValue(value)}</output>
      {unit && <span>{unit}</span>}
    </button>
  )
}

