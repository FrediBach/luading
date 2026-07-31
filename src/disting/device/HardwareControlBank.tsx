import {
  EndlessEncoder,
  MomentaryButton,
  PushRotaryControl,
} from '../controls'
import type { DistingUiControl } from '../types'
import {
  buttonControlAt,
  encoderControlAt,
  normalizePotPosition,
  potControlAt,
} from './hardware-controls'

interface Props {
  potPositions: number[]
  disabled?: boolean
  onPotTurn(index: number, value: number): void
  onEncoderTurn(index: 0 | 1, direction: -1 | 1): void
  onControlPress(control: DistingUiControl): void
  onControlRelease(control: DistingUiControl): void
}

export function HardwareControlBank({
  potPositions,
  disabled = false,
  onPotTurn,
  onEncoderTurn,
  onControlPress,
  onControlRelease,
}: Props) {
  const press = (control: DistingUiControl | null) => {
    if (control) onControlPress(control)
  }
  const release = (control: DistingUiControl | null) => {
    if (control) onControlRelease(control)
  }

  return (
    <section className="hardware-control-bank" aria-label="Simulated Disting NT hardware controls">
      <header className="device-panel-header">
        <span>
          <small>Hardware</small>
          <strong>3 pots · 2 encoders · 4 buttons</strong>
        </span>
      </header>

      <div className="hardware-control-bank-body">
        <div className="hardware-pot-row">
          {[0, 1, 2].map((index) => {
            const control = potControlAt(index)
            return (
              <PushRotaryControl
                label={`Pot ${index + 1}`}
                value={normalizePotPosition(potPositions[index] ?? 0.5)}
                min={0}
                max={1}
                step={0.001}
                defaultValue={0.5}
                disabled={disabled}
                formatValue={(value) => `${Math.round(value * 100)}%`}
                onChange={(value) => onPotTurn(index, value)}
                onPress={() => press(control)}
                onRelease={() => release(control)}
                key={index}
              />
            )
          })}
        </div>

        <div className="hardware-lower-row">
          <div className="hardware-encoder-row">
            {[0, 1].map((index) => {
              const control = encoderControlAt(index)
              return (
                <div className="hardware-encoder-control" key={index}>
                  <EndlessEncoder
                    label={`Encoder ${index + 1}`}
                    disabled={disabled}
                    onTurn={(direction) => onEncoderTurn(index as 0 | 1, direction)}
                  />
                  <MomentaryButton
                    label={`Encoder ${index + 1} push`}
                    compact
                    disabled={disabled}
                    onPress={() => press(control)}
                    onRelease={() => release(control)}
                  >
                    Push
                  </MomentaryButton>
                </div>
              )
            })}
          </div>

          <div className="hardware-button-cluster" aria-label="Hardware buttons">
            {[0, 1, 2, 3].map((index) => {
              const control = buttonControlAt(index)
              return (
                <MomentaryButton
                  label={`Button ${index + 1}`}
                  disabled={disabled}
                  onPress={() => press(control)}
                  onRelease={() => release(control)}
                  key={index}
                >
                  {index + 1}
                </MomentaryButton>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
