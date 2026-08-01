import { SegmentedSelector } from '../controls'
import {
  ARPEGGIO_CHORDS,
  ARPEGGIO_TYPES,
} from '../emulation/signal-sources'
import type {
  ArpeggioChord,
  ArpeggioType,
} from '../types'

interface Props {
  type: ArpeggioType
  chord: ArpeggioChord
  octaves: number
  onTypeChange(type: ArpeggioType): void
  onChordChange(chord: ArpeggioChord): void
  onOctavesChange(octaves: number): void
}

const OCTAVE_OPTIONS = [1, 2, 3, 4].map((octaves) => ({
  value: String(octaves),
  label: `${octaves}`,
}))

export function ArpeggioEditor({
  type,
  chord,
  octaves,
  onTypeChange,
  onChordChange,
  onOctavesChange,
}: Props) {
  return (
    <section className="arpeggio-editor" aria-labelledby="arpeggio-editor-heading">
      <div className="arpeggio-editor-heading">
        <h3 id="arpeggio-editor-heading">Arpeggio pattern</h3>
        <p>Choose the note order, chord, and register span.</p>
      </div>
      <div className="arpeggio-editor-controls">
        <SegmentedSelector
          label="Direction"
          value={type}
          options={ARPEGGIO_TYPES}
          onChange={(value) => onTypeChange(value as ArpeggioType)}
        />
        <SegmentedSelector
          label="Chord"
          value={chord}
          options={ARPEGGIO_CHORDS}
          onChange={(value) => onChordChange(value as ArpeggioChord)}
        />
        <SegmentedSelector
          label="Octaves"
          value={String(octaves)}
          options={OCTAVE_OPTIONS}
          onChange={(value) => onOctavesChange(Number(value))}
        />
      </div>
    </section>
  )
}
