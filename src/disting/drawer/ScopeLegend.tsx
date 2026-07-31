import type {
  LoadedProgram,
  ScopeProbe,
  ScopeSource,
} from '../types'
import { formatDisplayFloat } from '../display-format'
import { Tooltip } from '../controls'
import {
  decodeScopeSource,
  encodeScopeSource,
  scopeSourceName,
  scopeSourceShortLabel,
  scopeSourceValue,
} from './scope-controls'

interface Props {
  probes: readonly ScopeProbe[]
  program: LoadedProgram | null
  inputs: readonly number[]
  outputs: readonly number[]
  focusedProbeIndex: number | null
  onProbeChange(index: number, source: ScopeSource | null): void
  onProbeFocus(index: number): void
}

export function ScopeLegend({
  probes,
  program,
  inputs,
  outputs,
  focusedProbeIndex,
  onProbeChange,
  onProbeFocus,
}: Props) {
  return (
    <div className="scope-legend" aria-label="Oscilloscope probes">
      {probes.map((probe, index) => {
        const shortLabel = scopeSourceShortLabel(probe.source)
        const signalName = scopeSourceName(probe.source, program)
        return (
          <div
            className={`scope-legend-chip scope-probe--${index + 1}${
              focusedProbeIndex === index ? ' is-focused' : ''
            }`}
            key={probe.id}
          >
            <button
              type="button"
              className="scope-legend-focus"
              aria-label={`Focus scope probe ${index + 1}: ${shortLabel}, ${signalName}`}
              aria-pressed={focusedProbeIndex === index}
              onClick={() => onProbeFocus(index)}
            >
              <i />
              <b>CH {index + 1}</b>
              <Tooltip content={signalName} placement="bottom">
                <span className="scope-legend-source">{shortLabel}</span>
              </Tooltip>
              <output>
                {formatDisplayFloat(scopeSourceValue(probe.source, inputs, outputs))} V
              </output>
            </button>
            <select
              value={encodeScopeSource(probe.source)}
              aria-label={`Route scope probe ${index + 1}`}
              onChange={(event) => onProbeChange(
                index,
                decodeScopeSource(event.target.value),
              )}
            >
              <option value="">Unpatched</option>
              {Array.from(
                { length: program?.inputCount ?? 0 },
                (_, inputIndex) => (
                  <option
                    value={`input:${inputIndex}`}
                    key={`input:${inputIndex}`}
                  >
                    IN {inputIndex + 1} · {
                      program?.inputNames[inputIndex] ?? `Input ${inputIndex + 1}`
                    }
                  </option>
                ),
              )}
              {Array.from(
                { length: program?.outputCount ?? 0 },
                (_, outputIndex) => (
                  <option
                    value={`output:${outputIndex}`}
                    key={`output:${outputIndex}`}
                  >
                    OUT {outputIndex + 1} · {
                      program?.outputNames[outputIndex] ?? `Output ${outputIndex + 1}`
                    }
                  </option>
                ),
              )}
            </select>
          </div>
        )
      })}
    </div>
  )
}
