import { ControlIcon } from '../controls'
import type { ThemeMode } from '../theme'

interface Props {
  theme: ThemeMode
  onToggle(): void
}

export function ThemeToggle({ theme, onToggle }: Props) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      className="commandbar-icon-command theme-toggle"
      aria-label={`Switch to ${nextTheme} mode`}
      aria-pressed={theme === 'light'}
      title={`Switch to ${nextTheme} mode`}
      onClick={onToggle}
    >
      <ControlIcon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
    </button>
  )
}
