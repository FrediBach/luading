import { useId } from 'react'
import type { ScriptParameterPreset } from '../types'

interface Props {
  presets: readonly ScriptParameterPreset[]
  activeIndex: number | null
  disabled?: boolean
  onApply(index: number): void
}

export function ParameterPresetSelector({
  presets,
  activeIndex,
  disabled = false,
  onApply,
}: Props) {
  const descriptionId = useId()

  return (
    <label className="parameter-preset-selector">
      <span>
        Parameter preset
        <small>Simulator</small>
      </span>
      <select
        value={activeIndex === null ? '' : String(activeIndex)}
        disabled={disabled}
        aria-describedby={descriptionId}
        onChange={(event) => {
          if (event.target.value !== '') onApply(Number(event.target.value))
        }}
      >
        <option value="" disabled>Custom</option>
        {presets.map((preset, index) => (
          <option value={index} key={`${preset.name}-${index}`}>
            {preset.name}
          </option>
        ))}
      </select>
      <span className="sr-only" id={descriptionId}>
        Luading-only parameter presets are ignored by Disting NT hardware.
      </span>
    </label>
  )
}
