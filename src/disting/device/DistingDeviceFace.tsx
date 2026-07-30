import type { DistingUiControl, DrawCommand } from '../types'
import { DistingDisplayBezel } from './DistingDisplayBezel'
import { HardwareControlBank } from './HardwareControlBank'

interface Props {
  commands: DrawCommand[]
  programName: string
  customUi: boolean | null
  simulatedSeconds: number
  potPositions: number[]
  onPotTurn(index: number, value: number): void
  onEncoderTurn(index: 0 | 1, direction: -1 | 1): void
  onControlPress(control: DistingUiControl): void
  onControlRelease(control: DistingUiControl): void
}

export function DistingDeviceFace({
  commands,
  programName,
  customUi,
  simulatedSeconds,
  potPositions,
  onPotTurn,
  onEncoderTurn,
  onControlPress,
  onControlRelease,
}: Props) {
  const loaded = customUi !== null

  return (
    <section className="disting-device-face" aria-label="Simulated Disting NT front panel">
      <div className="disting-device-face-grid">
        <DistingDisplayBezel
          commands={commands}
          programName={programName}
          uiMode={!loaded ? 'unloaded' : customUi ? 'custom' : 'standard'}
          simulatedSeconds={simulatedSeconds}
        />
        <HardwareControlBank
          potPositions={potPositions}
          disabled={!loaded}
          onPotTurn={onPotTurn}
          onEncoderTurn={onEncoderTurn}
          onControlPress={onControlPress}
          onControlRelease={onControlRelease}
        />
      </div>
    </section>
  )
}
