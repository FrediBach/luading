import type {
  ScriptDiagnostic,
  ScriptQualityReport,
} from '../validation/types'
import { DiagnosticsList } from './DiagnosticsList'
import { QualitySummary } from './QualitySummary'

interface Props {
  diagnostics: ScriptDiagnostic[]
  report: ScriptQualityReport
  onSelectDiagnostic(diagnostic: ScriptDiagnostic): void
}

export function ProblemsWorkspace({
  diagnostics,
  report,
  onSelectDiagnostic,
}: Props) {
  return (
    <section className="problems-workspace" aria-label="Problems workspace">
      <QualitySummary diagnostics={diagnostics} report={report} />
      <DiagnosticsList
        diagnostics={diagnostics}
        onSelectDiagnostic={onSelectDiagnostic}
      />
    </section>
  )
}
