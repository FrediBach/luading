import type { ScriptDiagnostic } from '../validation/types'
import {
  boundedDiagnostics,
  diagnosticLocation,
  MAX_RENDERED_DIAGNOSTICS,
} from './drawer-workspaces'

interface Props {
  diagnostics: ScriptDiagnostic[]
  onSelectDiagnostic(diagnostic: ScriptDiagnostic): void
}

export function DiagnosticsList({
  diagnostics,
  onSelectDiagnostic,
}: Props) {
  const visibleDiagnostics = boundedDiagnostics(diagnostics)
  const hiddenCount = Math.max(0, diagnostics.length - MAX_RENDERED_DIAGNOSTICS)

  if (diagnostics.length === 0) {
    return (
      <div className="diagnostics-empty">
        <strong>No findings</strong>
        <span>The current script has no validation diagnostics.</span>
      </div>
    )
  }

  return (
    <div className="diagnostics-list" aria-label="Script diagnostics">
      {visibleDiagnostics.map((diagnostic) => (
        <button
          type="button"
          className={`diagnostic-row diagnostic-row--${diagnostic.severity}`}
          key={diagnostic.id}
          onClick={() => onSelectDiagnostic(diagnostic)}
          disabled={!diagnostic.range}
          title={diagnostic.range ? 'Reveal source location' : undefined}
        >
          <i aria-hidden="true" />
          <span className="diagnostic-row-copy">
            <strong>{diagnostic.message}</strong>
            <small>{diagnostic.detail}</small>
            {diagnostic.suggestion && <em>{diagnostic.suggestion}</em>}
          </span>
          <span className="diagnostic-row-meta">
            <b>{diagnostic.target}</b>
            <small>{diagnostic.origin}</small>
            {diagnosticLocation(diagnostic) && (
              <small>{diagnosticLocation(diagnostic)}</small>
            )}
            {diagnostic.penalty > 0 && <small>−{diagnostic.penalty} pts</small>}
          </span>
        </button>
      ))}
      {hiddenCount > 0 && (
        <p className="diagnostics-limit-note">
          Showing the first {MAX_RENDERED_DIAGNOSTICS} findings · {hiddenCount} more
        </p>
      )}
    </div>
  )
}
