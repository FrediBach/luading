interface Option {
  value: string
  label: string
}

interface Props {
  label: string
  value: string
  options: readonly Option[]
  disabled?: boolean
  onChange(value: string): void
}

export function SegmentedSelector({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: Props) {
  return (
    <fieldset className="segmented-selector" disabled={disabled}>
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            type="button"
            className={value === option.value ? 'is-active' : ''}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            key={option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

