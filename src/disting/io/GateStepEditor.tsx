import {
  MAX_SEQUENCE_STEPS,
  normalizeGateSequenceSteps,
} from '../emulation/signal-sources'

interface Props {
  stepCount: number
  steps: readonly boolean[]
  onChange(steps: boolean[]): void
}

export function GateStepEditor({ stepCount, steps, onChange }: Props) {
  const normalizedSteps = normalizeGateSequenceSteps(steps)
  const visibleStepCount = Math.min(
    MAX_SEQUENCE_STEPS,
    Math.max(1, Math.round(stepCount)),
  )

  return (
    <section className="gate-step-editor" aria-labelledby="gate-step-editor-heading">
      <div className="gate-step-editor-heading">
        <h3 id="gate-step-editor-heading">Gate pattern</h3>
        <p>Click a step to toggle its gate.</p>
      </div>
      <div className="gate-step-grid" role="group" aria-label="Gate sequencer steps">
        {normalizedSteps.slice(0, visibleStepCount).map((enabled, index) => (
          <button
            type="button"
            className={index % 4 === 0 ? 'is-beat' : undefined}
            aria-label={`Step ${index + 1} ${enabled ? 'on' : 'off'}`}
            aria-pressed={enabled}
            onClick={() => {
              const next = [...normalizedSteps]
              next[index] = !enabled
              onChange(next)
            }}
            key={index}
          >
            <span>{index + 1}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
