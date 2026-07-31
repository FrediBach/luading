import { formatDisplayFloat } from '../display-format'

export type RuntimeStateValue =
  | 'booting'
  | 'loading'
  | 'paused'
  | 'running'
  | 'error'

interface Props {
  status: RuntimeStateValue
  simulatedSeconds: number
}

export function RuntimeStatus({ status, simulatedSeconds }: Props) {
  const duration = `${formatDisplayFloat(simulatedSeconds)} s`
  const running = status === 'running'
  return (
    <div
      className={`workbench-runtime-state workbench-runtime-state--${status}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`Lua runtime ${status}${running ? `, ${duration} simulated` : ''}`}
    >
      <i aria-hidden="true" />
      <span>{status}</span>
      {running && (
        <span className="workbench-runtime-duration" aria-hidden="true">
          {duration}
        </span>
      )}
    </div>
  )
}
