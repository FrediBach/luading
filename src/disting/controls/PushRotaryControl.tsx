import { MomentaryButton } from './MomentaryButton'
import { RotaryControl } from './RotaryControl'

interface Props {
  label: string
  value: number
  min: number
  max: number
  step?: number
  defaultValue?: number
  unit?: string
  disabled?: boolean
  formatValue?(value: number): string
  onChange(value: number): void
  onPress(): void
  onRelease(): void
}

export function PushRotaryControl({
  label,
  value,
  min,
  max,
  step,
  defaultValue,
  unit,
  disabled = false,
  formatValue,
  onChange,
  onPress,
  onRelease,
}: Props) {
  return (
    <div className="push-rotary-control">
      <RotaryControl
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        defaultValue={defaultValue}
        unit={unit}
        disabled={disabled}
        formatValue={formatValue}
        onChange={onChange}
      />
      <MomentaryButton
        label={`${label} push`}
        compact
        disabled={disabled}
        onPress={onPress}
        onRelease={onRelease}
      >
        Push
      </MomentaryButton>
    </div>
  )
}

