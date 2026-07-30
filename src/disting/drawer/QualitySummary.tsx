import type { ScriptDiagnostic, ScriptQualityReport } from '../validation/types'

interface Props {
  diagnostics: ScriptDiagnostic[]
  report: ScriptQualityReport
}

function statusLabel(report: ScriptQualityReport) {
  if (report.status === 'invalid') return 'Invalid'
  if (report.status === 'pending') return 'Run to score'
  if (report.status === 'provisional') return 'Provisional'
  return 'Validated'
}

export function QualitySummary({ diagnostics, report }: Props) {
  const compatibilityCount = diagnostics.filter(
    (item) => item.category === 'compatibility',
  ).length

  return (
    <header className={`quality-summary quality-summary--${report.status}`}>
      <div className="quality-summary-score">
        <span>Script health</span>
        <strong>
          {report.score === null ? statusLabel(report) : `${report.score} · ${report.grade}`}
        </strong>
      </div>

      <div className="quality-summary-counts" aria-label="Diagnostic counts">
        <span className={report.errorCount > 0 ? 'is-error' : ''}>
          <b>{report.errorCount}</b> errors
        </span>
        <span className={report.warningCount > 0 ? 'is-warning' : ''}>
          <b>{report.warningCount}</b> warnings
        </span>
        <span><b>{report.infoCount}</b> notes</span>
      </div>

      <div className="quality-summary-profile">
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
              ? `Sampling ${report.sampledSteps.toLocaleString()} / 1,000`
              : 'Runtime sample pending'}
        </span>
      </div>

      <div className="quality-category-row" aria-label="Quality category scores">
        {report.categories.map((category) => (
          <div key={category.category}>
            <span>{category.label}</span>
            <strong>{category.score}<small>/{category.maximum}</small></strong>
            <i aria-hidden="true">
              <b style={{ width: `${category.score / category.maximum * 100}%` }} />
            </i>
          </div>
        ))}
      </div>
    </header>
  )
}
