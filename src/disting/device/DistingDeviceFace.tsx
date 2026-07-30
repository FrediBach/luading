import type { ReactNode } from 'react'
import type { DistingUiControl, DrawCommand } from '../types'
import { DistingDisplayBezel } from './DistingDisplayBezel'
import { HardwareControlBank } from './HardwareControlBank'
import { SaveStateControl } from './SaveStateControl'

interface Props {
  commands: DrawCommand[]
  programName: string
  customUi: boolean | null
  simulatedSeconds: number
  potPositions: number[]
  savedState: boolean
  utilities?: ReactNode
  onSaveState(): void
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
  savedState,
  utilities,
  onSaveState,
  onPotTurn,
  onEncoderTurn,
  onControlPress,
  onControlRelease,
}: Props) {
  const loaded = customUi !== null

  return (
    <section className="disting-device-face" aria-label="Simulated Disting NT front panel">
      <header className="disting-device-face-header">
        <span>
          <small>Simulated module</small>
          <strong>disting NT</strong>
        </span>
        <SaveStateControl
          saved={savedState}
          disabled={!loaded}
          onSave={onSaveState}
        />
      </header>

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

      {utilities && <div className="disting-device-utilities">{utilities}</div>}
    </section>
  )
}

