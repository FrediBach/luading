import { DistingDisplay } from '../DistingDisplay'
import type { DrawCommand } from '../types'

interface Props {
  commands: DrawCommand[]
  programName: string
  uiMode: 'custom' | 'standard' | 'unloaded'
  simulatedSeconds: number
}

export function DistingDisplayBezel({
  commands,
  programName,
  uiMode,
  simulatedSeconds,
}: Props) {
  const modeLabel = uiMode === 'custom'
    ? 'Custom UI'
    : uiMode === 'standard'
      ? 'Standard UI'
      : 'No script'

  return (
    <section className="device-display-bezel" aria-label="Simulated Disting NT display section">
      <header>
        <span>
          <b>{programName}</b>
          <small>{modeLabel}</small>
        </span>
        <output>{simulatedSeconds.toFixed(3)} s</output>
      </header>
      <div className="device-display-recess">
        <DistingDisplay commands={commands} />
      </div>
    </section>
  )
}

