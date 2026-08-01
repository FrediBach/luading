import {
  EndlessEncoder,
  MomentaryButton,
  PushRotaryControl,
} from '../controls'
import { PanelEmptyState } from '../PanelEmptyState'
import type { DistingUiControl } from '../types'
import {
  buttonControlAt,
  encoderControlAt,
  normalizePotPosition,
  potControlAt,
} from './hardware-controls'

interface Props {
  potPositions: number[]
  activeControls: readonly DistingUiControl[]
  disabled?: boolean
  onPotTurn(index: number, value: number): void
  onEncoderTurn(index: 0 | 1, direction: -1 | 1): void
  onControlPress(control: DistingUiControl): void
  onControlRelease(control: DistingUiControl): void
}

export function HardwareControlBank({
  potPositions,
  activeControls,
  disabled = false,
  onPotTurn,
  onEncoderTurn,
  onControlPress,
  onControlRelease,
}: Props) {
  const activeControlSet = new Set(activeControls)
  const activePotIndices = [0, 1, 2].filter((index) => {
    const control = potControlAt(index)
    return control !== null && activeControlSet.has(control)
  })
  const activeEncoderIndices = [0, 1].filter((index) => {
    const control = encoderControlAt(index)
    return control !== null && activeControlSet.has(control)
  })
  const activeButtonIndices = [0, 1, 2, 3].filter((index) => {
    const control = buttonControlAt(index)
    return control !== null && activeControlSet.has(control)
  })
  const summary = [
    [activePotIndices.length, 'pot'],
    [activeEncoderIndices.length, 'encoder'],
    [activeButtonIndices.length, 'button'],
  ] as const
  const summaryLabel = summary
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}${count === 1 ? '' : 's'}`)
    .join(' · ')

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
          <strong>{summaryLabel || '0 script controls'}</strong>
        </span>
      </header>

      <div className="hardware-control-bank-body">
        {activeControls.length === 0 ? (
          <PanelEmptyState title="No hardware controls used">
            Add a pot, encoder, or button callback such as pot1Turn() to
            interact with it here.
          </PanelEmptyState>
        ) : (
          <>
            {activePotIndices.length > 0 && (
              <div className="hardware-pot-row">
                {activePotIndices.map((index) => {
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
            )}

            {(activeEncoderIndices.length > 0 || activeButtonIndices.length > 0) && (
              <div className={`hardware-lower-row${
                activeEncoderIndices.length === 0 || activeButtonIndices.length === 0
                  ? ' hardware-lower-row--single'
                  : ''
              }`}>
                {activeEncoderIndices.length > 0 && (
                  <div className="hardware-encoder-row">
                    {activeEncoderIndices.map((index) => {
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
                )}

                {activeButtonIndices.length > 0 && (
                  <div className="hardware-button-cluster" aria-label="Hardware buttons">
                    {activeButtonIndices.map((index) => {
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
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
