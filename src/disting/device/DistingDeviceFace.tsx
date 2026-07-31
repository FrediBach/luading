import type { DistingUiControl } from '../types'
import { HardwareControlBank } from './HardwareControlBank'

interface Props {
  potPositions: number[]
  disabled?: boolean
  onPotTurn(index: number, value: number): void
  onEncoderTurn(index: 0 | 1, direction: -1 | 1): void
  onControlPress(control: DistingUiControl): void
  onControlRelease(control: DistingUiControl): void
}

export function DistingDeviceFace({
  potPositions,
  disabled = false,
  onPotTurn,
  onEncoderTurn,
  onControlPress,
  onControlRelease,
}: Props) {
  return (
    <section className="disting-device-face" aria-label="Simulated Disting NT front panel">
      <HardwareControlBank
        potPositions={potPositions}
        disabled={disabled}
        onPotTurn={onPotTurn}
        onEncoderTurn={onEncoderTurn}
        onControlPress={onControlPress}
        onControlRelease={onControlRelease}
      />
    </section>
  )
}
