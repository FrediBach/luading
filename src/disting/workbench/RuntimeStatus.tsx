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
  return (
    <div
      className={`workbench-runtime-state workbench-runtime-state--${status}`}
      role="status"
      aria-live="polite"
      aria-label={`Lua runtime ${status}; ${simulatedSeconds.toFixed(3)} simulated seconds`}
      title={`${simulatedSeconds.toFixed(3)} s simulated`}
    >
      <i aria-hidden="true" />
      <span>{status}</span>
    </div>
  )
}
