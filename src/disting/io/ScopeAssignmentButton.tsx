import { CornerAction } from '../controls'
import type { ScopeProbe, ScopeSource } from '../types'
import {
  assignedProbeIndex,
  scopeAssignmentIntent,
  scopeSourcesEqual,
} from '../drawer/scope-controls'

interface ButtonProps {
  label: string
  source: ScopeSource
  probes: readonly ScopeProbe[]
  onProbeChange(index: number, source: ScopeSource | null): void
  onProbeFocus(index: number): void
  onRequestChooser(): void
}

export function ScopeAssignmentButton({
  label,
  source,
  probes,
  onProbeChange,
  onProbeFocus,
  onRequestChooser,
}: ButtonProps) {
  const assignedIndex = assignedProbeIndex(probes, source)

  return (
    <span className={`scope-assignment-button${
      assignedIndex >= 0 ? ` scope-probe--${assignedIndex + 1}` : ''
    }`}>
      <CornerAction
        icon="scope"
        label={assignedIndex >= 0
          ? `${label} assigned to scope probe ${assignedIndex + 1}`
          : `Assign ${label} to scope`}
        pressed={assignedIndex >= 0}
        onClick={() => {
          const intent = scopeAssignmentIntent(probes, source)
          if (intent.kind === 'focus') {
            onProbeFocus(intent.probeIndex)
            onRequestChooser()
            return
          }
          if (intent.kind === 'choose') {
            onRequestChooser()
            return
          }
          onProbeChange(intent.probeIndex, source)
          onProbeFocus(intent.probeIndex)
        }}
      />
    </span>
  )
}

interface ChooserProps {
  label: string
  source: ScopeSource
  probes: readonly ScopeProbe[]
  focusedProbeIndex: number | null
  onChoose(index: number): void
  onUnassign(index: number): void
}

function compactSourceLabel(source: ScopeSource | null) {
  if (!source) return 'Free'
  return `${source.kind === 'input' ? 'IN' : 'OUT'} ${source.index + 1}`
}

export function ScopeProbeChooser({
  label,
  source,
  probes,
  focusedProbeIndex,
  onChoose,
  onUnassign,
}: ChooserProps) {
  const assignedIndex = assignedProbeIndex(probes, source)

  return (
    <div className="scope-probe-chooser">
      <p>
        Choose a probe for {label}. Selecting an occupied probe explicitly
        replaces its current source.
      </p>
      <div>
        {probes.map((probe, index) => {
          const assignedHere = scopeSourcesEqual(probe.source, source)
          return (
            <button
              type="button"
              className={`scope-probe-choice scope-probe--${index + 1}${
                assignedHere ? ' is-assigned' : ''
              }`}
              aria-pressed={assignedHere}
              onClick={() => onChoose(index)}
              key={probe.id}
            >
              <i />
              <span>
                <strong>Probe {index + 1}</strong>
                <small>
                  {assignedHere
                    ? 'Assigned here'
                    : probe.source
                      ? `Replace ${compactSourceLabel(probe.source)}`
                      : 'Free'}
                  {focusedProbeIndex === index ? ' · focused' : ''}
                </small>
              </span>
            </button>
          )
        })}
      </div>
      {assignedIndex >= 0 && (
        <button
          type="button"
          className="scope-probe-unassign"
          onClick={() => onUnassign(assignedIndex)}
        >
          Unassign from scope
        </button>
      )}
    </div>
  )
}
