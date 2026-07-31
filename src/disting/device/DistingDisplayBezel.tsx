import { DistingDisplay } from '../DistingDisplay'
import type { DrawCommand } from '../types'

interface Props {
  commands: DrawCommand[]
}

export function DistingDisplayBezel({ commands }: Props) {
  return (
    <section className="device-display-bezel" aria-label="Simulated Disting NT display section">
      <div className="device-display-recess">
        <DistingDisplay commands={commands} />
      </div>
    </section>
  )
}
