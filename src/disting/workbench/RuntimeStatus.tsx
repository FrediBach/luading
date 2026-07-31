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
  const duration = `${simulatedSeconds.toFixed(3)} s`
  return (
    <div
      className={`workbench-runtime-state workbench-runtime-state--${status}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`Lua runtime ${status}, ${duration} simulated`}
    >
      <i aria-hidden="true" />
      <span>{status}</span>
      <span className="workbench-runtime-duration" aria-hidden="true">
        {duration}
      </span>
    </div>
  )
}
