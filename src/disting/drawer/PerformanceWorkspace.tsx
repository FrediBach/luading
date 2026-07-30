import type { RuntimeStats } from '../types'
import {
  formatDuration,
  performanceBudgetState,
} from './drawer-workspaces'

interface Props {
  stats: RuntimeStats
}

const CALLBACK_ORDER = ['init', 'step', 'trigger', 'gate', 'draw'] as const

export function PerformanceWorkspace({ stats }: Props) {
  const budgetState = performanceBudgetState(stats.budgetPercent)
  const callbackEntries = CALLBACK_ORDER.flatMap((name) => {
    const callback = stats.callbacks[name]
    return callback ? [{ name, callback }] : []
  })

  return (
    <section className="performance-workspace" aria-label="Runtime performance">
      <div className="performance-metrics">
        <div>
          <span>Average step</span>
          <strong>{formatDuration(stats.averageUs)}</strong>
          <small>Lua callback + boundary</small>
        </div>
        <div>
          <span>95th percentile</span>
          <strong>{formatDuration(stats.p95Us)}</strong>
          <small>Last 2,000 steps</small>
        </div>
        <div>
          <span>Worst step</span>
          <strong>{formatDuration(stats.maxUs)}</strong>
          <small>Observed maximum</small>
        </div>
        <div>
          <span>Dropped steps</span>
          <strong>{stats.droppedSteps.toLocaleString()}</strong>
          <small>Browser catch-up drops</small>
        </div>
        <div className={`performance-budget performance-budget--${budgetState}`}>
          <span>Local 1 ms budget</span>
          <strong>{stats.budgetPercent.toFixed(2)}%</strong>
          <small>{budgetState}</small>
        </div>
      </div>

      <details className="callback-performance">
        <summary>
          Callback detail
          <span>{callbackEntries.length} measured</span>
        </summary>
        {callbackEntries.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Callback</th>
                <th>Calls</th>
                <th>Average</th>
                <th>P95</th>
                <th>Worst</th>
              </tr>
            </thead>
            <tbody>
              {callbackEntries.map(({ name, callback }) => (
                <tr key={name}>
                  <th>{name}()</th>
                  <td>{callback.calls.toLocaleString()}</td>
                  <td>{formatDuration(callback.averageUs)}</td>
                  <td>{formatDuration(callback.p95Us)}</td>
                  <td>{formatDuration(callback.maxUs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No callback samples yet.</p>
        )}
      </details>

      <p className="performance-disclaimer">
        Browser-local timing only. These measurements are not calibrated Disting NT
        CPU usage; confirm performance on the module.
      </p>
    </section>
  )
}
