interface Props {
  label: string
  status: 'pending' | 'invalid' | 'provisional' | 'scored'
  errorCount: number
  warningCount: number
  onOpen(): void
}

export function HealthBadge({
  label,
  status,
  errorCount,
  warningCount,
  onOpen,
}: Props) {
  const detail = errorCount > 0
    ? `${errorCount} ${errorCount === 1 ? 'error' : 'errors'}`
    : warningCount > 0
      ? `${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}`
      : status === 'scored'
        ? 'validated'
        : 'validation pending'
  const accessibleState = label.toLocaleLowerCase() === detail
    ? label
    : `${label}; ${detail}`

  return (
    <button
      type="button"
      className={`workbench-health workbench-health--${status}`}
      onClick={onOpen}
      aria-label={`Open Problems workspace: ${accessibleState}`}
    >
      <i aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}
