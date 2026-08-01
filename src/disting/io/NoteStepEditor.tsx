import { ValueField } from '../controls'
import {
  MAX_NOTE_SEQUENCE_SEMITONES,
  MAX_SEQUENCE_STEPS,
  MIN_NOTE_SEQUENCE_SEMITONES,
  normalizeNoteSequenceSteps,
} from '../emulation/signal-sources'
import {
  formatSequenceNote,
  parseSequenceNote,
} from './note-step-editor'

interface Props {
  stepCount: number
  steps: readonly number[]
  onChange(steps: number[]): void
}

export function NoteStepEditor({ stepCount, steps, onChange }: Props) {
  const normalizedSteps = normalizeNoteSequenceSteps(steps)
  const visibleStepCount = Math.min(
    MAX_SEQUENCE_STEPS,
    Math.max(1, Math.round(stepCount)),
  )

  return (
    <section className="note-step-editor" aria-labelledby="note-step-editor-heading">
      <div className="note-step-editor-heading">
        <h3 id="note-step-editor-heading">Note pattern</h3>
        <p>Click a note to enter C#1, Db1, or a semitone offset.</p>
      </div>
      <div className="note-step-grid" role="group" aria-label="Note sequencer steps">
        {normalizedSteps.slice(0, visibleStepCount).map((semitones, index) => (
          <div className={index % 4 === 0 ? 'is-beat' : undefined} key={index}>
            <span>Step {index + 1}</span>
            <ValueField
              label={`Step ${index + 1} note`}
              value={semitones}
              min={MIN_NOTE_SEQUENCE_SEMITONES}
              max={MAX_NOTE_SEQUENCE_SEMITONES}
              step={1}
              formatValue={formatSequenceNote}
              parseValue={parseSequenceNote}
              onChange={(value) => {
                const next = [...normalizedSteps]
                next[index] = value
                onChange(next)
              }}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
