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
  return (
    <label className="parameter-preset-selector">
      <select
        value={activeIndex === null ? '' : String(activeIndex)}
        disabled={disabled}
        aria-label="Parameter preset"
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
    </label>
  )
}
