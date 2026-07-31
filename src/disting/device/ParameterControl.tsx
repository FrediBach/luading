import { memo, useRef, useState } from 'react'
import {
  ControlPopover,
  CornerAction,
  RotaryControl,
  SegmentedSelector,
} from '../controls'
import type { ParameterDefinition } from '../types'
import {
  formatParameterValue,
  parameterControlKind,
  parameterStep,
} from './parameter-controls'

interface Props {
  definition: ParameterDefinition
  value: number
  onChange(value: number): void
}

export const ParameterControl = memo(function ParameterControl({
  definition,
  value,
  onChange,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const kind = parameterControlKind(definition)
  const enumValues = definition.enumValues ?? []
  const enumOffset = definition.enumOffset ?? 1
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredEnumValues = enumValues
    .map((label, index) => ({ label, value: index + enumOffset }))
    .filter((option) => (
      !normalizedQuery || option.label.toLocaleLowerCase().includes(normalizedQuery)
    ))

  if (kind === 'enum-segmented') {
    return (
      <div className="parameter-control parameter-control--enum" data-control-kind={kind}>
        <CornerAction
          icon="reset"
          label={`Reset ${definition.name}`}
          disabled={value === definition.value}
          onClick={() => onChange(definition.value)}
        />
        <SegmentedSelector
          label={definition.name}
          value={String(Math.round(value))}
          options={enumValues.map((label, index) => ({
            value: String(index + enumOffset),
            label,
          }))}
          onChange={(nextValue) => onChange(Number(nextValue))}
        />
        <output>{formatParameterValue(definition, value)}</output>
      </div>
    )
  }

  if (kind === 'enum-menu') {
    return (
      <div className="parameter-control parameter-control--enum-menu" data-control-kind={kind}>
        <span>{definition.name}</span>
        <div className="parameter-enum-actions">
          <CornerAction
            icon="reset"
            label={`Reset ${definition.name}`}
            disabled={value === definition.value}
            onClick={() => onChange(definition.value)}
          />
          <button
            ref={menuButtonRef}
            type="button"
            className="parameter-enum-value"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => {
              setQuery('')
              setMenuOpen((current) => !current)
            }}
          >
            <strong>{formatParameterValue(definition, value)}</strong>
            <small>{Math.round(value)} / {enumValues.length}</small>
          </button>
        </div>
        <ControlPopover
          open={menuOpen}
          label={definition.name}
          anchorRef={menuButtonRef}
          onClose={() => setMenuOpen(false)}
        >
          {enumValues.length > 8 && (
            <input
              className="parameter-enum-search"
              type="search"
              value={query}
              placeholder="Filter options…"
              aria-label={`Filter ${definition.name} options`}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
          <div className="parameter-enum-options" role="listbox" aria-label={definition.name}>
            {filteredEnumValues.map((option) => (
              <button
                type="button"
                role="option"
                aria-selected={Math.round(value) === option.value}
                className={Math.round(value) === option.value ? 'is-active' : ''}
                onClick={() => {
                  onChange(option.value)
                  setMenuOpen(false)
                }}
                key={option.value}
              >
                <span>{option.label}</span>
                <small>{option.value}</small>
              </button>
            ))}
            {filteredEnumValues.length === 0 && <p>No matching options.</p>}
          </div>
        </ControlPopover>
      </div>
    )
  }

  return (
    <div className="parameter-control" data-control-kind={kind}>
      <RotaryControl
        label={definition.name}
        value={value}
        min={definition.min}
        max={definition.max}
        step={parameterStep(definition)}
        defaultValue={definition.value}
        unit={definition.unit}
        bipolar={kind === 'bipolar'}
        formatValue={(nextValue) => formatParameterValue(definition, nextValue)}
        onChange={onChange}
      />
    </div>
  )
})
