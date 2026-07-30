import type { CSSProperties } from 'react'
import { controlValueToUnit } from './control-math'

interface Props {
  label: string
  value: number
  min: number
  max: number
  bipolar?: boolean
}

export function LevelMeter({
  label,
  value,
  min,
  max,
  bipolar = min < 0 && max > 0,
}: Props) {
  const unit = controlValueToUnit(value, min, max)
  const zero = controlValueToUnit(0, min, max)
  const start = bipolar ? Math.min(unit, zero) : 0
  const extent = bipolar ? Math.abs(unit - zero) : unit

  return (
    <div
      className={`level-meter${bipolar ? ' is-bipolar' : ''}`}
      role="meter"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      style={{
        '--meter-start': `${start * 100}%`,
        '--meter-extent': `${extent * 100}%`,
        '--meter-zero': `${zero * 100}%`,
      } as CSSProperties}
    >
      <i />
      {bipolar && <b />}
    </div>
  )
}

