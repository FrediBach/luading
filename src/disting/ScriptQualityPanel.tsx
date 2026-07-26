import type {
  ScriptDiagnostic,
  ScriptQualityReport,
} from './validation/types'

type ScriptQualityPanelProps = {
  diagnostics: ScriptDiagnostic[]
  report: ScriptQualityReport
  onSelectDiagnostic(diagnostic: ScriptDiagnostic): void
}

function statusLabel(report: ScriptQualityReport) {
  if (report.status === 'invalid') return 'Invalid'
  if (report.status === 'pending') return 'Run to score'
  if (report.status === 'provisional') return 'Provisional'
  return 'Validated'
}

function diagnosticLocation(diagnostic: ScriptDiagnostic) {
  return diagnostic.range ? `Line ${diagnostic.range.startLine}` : diagnostic.callback ? `${diagnostic.callback}()` : ''
}

export function ScriptQualityPanel({
  diagnostics,
  report,
  onSelectDiagnostic,
}: ScriptQualityPanelProps) {
  const compatibilityCount = diagnostics.filter((item) => item.category === 'compatibility').length

  return (
    <section className={`disting-quality disting-quality--${report.status}`} aria-label="Script quality">
      <div className="disting-quality-head">
        <div>
          <span className="disting-panel-kicker">SCRIPT HEALTH</span>
          <strong>
            {report.score === null ? statusLabel(report) : `${report.score} · ${report.grade}`}
          </strong>
        </div>
        <div className="disting-quality-summary">
          <span className={report.errorCount > 0 ? 'is-error' : ''}>{report.errorCount} errors</span>
          <span className={report.warningCount > 0 ? 'is-warning' : ''}>{report.warningCount} warnings</span>
          <span>{report.infoCount} notes</span>
        </div>
      </div>

      <div className="disting-quality-profile">
        <span>{report.profile}</span>
        <span>
          {compatibilityCount > 0
            ? `${compatibilityCount} hardware API ${compatibilityCount === 1 ? 'gap' : 'gaps'}`
            : 'Simulator compatible'}
        </span>
        <span>
          {report.status === 'scored'
            ? `${report.sampledSteps.toLocaleString()} sampled steps`
            : report.status === 'provisional'
              ? `Sampling ${report.sampledSteps.toLocaleString()} / 1,000 steps`
              : 'Runtime sample pending'}
        </span>
      </div>

      <div className="disting-quality-categories">
        {report.categories.map((category) => (
          <div key={category.category}>
            <span>{category.label}</span>
            <strong>{category.score}<small>/{category.maximum}</small></strong>
            <i>
              <b style={{ width: `${category.score / category.maximum * 100}%` }} />
            </i>
          </div>
        ))}
      </div>

      {diagnostics.length > 0 ? (
        <div className="disting-quality-findings">
          {diagnostics.map((diagnostic) => (
            <button
              type="button"
              className={`disting-quality-finding disting-quality-finding--${diagnostic.severity}`}
              key={diagnostic.id}
              onClick={() => onSelectDiagnostic(diagnostic)}
              disabled={!diagnostic.range}
            >
              <i aria-hidden="true" />
              <span>
                <strong>{diagnostic.message}</strong>
                <small>{diagnostic.detail}</small>
                {diagnostic.suggestion && <em>{diagnostic.suggestion}</em>}
              </span>
              <span className="disting-quality-meta">
                <b>{diagnostic.target}</b>
                {diagnosticLocation(diagnostic) && <small>{diagnosticLocation(diagnostic)}</small>}
                {diagnostic.penalty > 0 && <small>−{diagnostic.penalty}</small>}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="disting-quality-empty">No validation findings for the current script.</p>
      )}
    </section>
  )
}
