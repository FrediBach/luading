import { useRef, useState, type ReactNode } from 'react'

interface Props {
  label: string
  children?: ReactNode
  disabled?: boolean
  compact?: boolean
  onPress(): void
  onRelease(): void
}

export function MomentaryButton({
  label,
  children,
  disabled = false,
  compact = false,
  onPress,
  onRelease,
}: Props) {
  const activeRef = useRef(false)
  const activationHandledRef = useRef(false)
  const [active, setActive] = useState(false)

  const press = () => {
    if (disabled || activeRef.current) return
    activeRef.current = true
    setActive(true)
    onPress()
  }

  const release = () => {
    if (!activeRef.current) return
    activeRef.current = false
    setActive(false)
    onRelease()
  }

  return (
    <button
      type="button"
      className={`momentary-button${active ? ' is-active' : ''}${compact ? ' is-compact' : ''}`}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        activationHandledRef.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
        press()
      }}
      onPointerUp={(event) => {
        release()
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onKeyDown={(event) => {
        if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return
        activationHandledRef.current = true
        press()
      }}
      onKeyUp={(event) => {
        if (event.key === 'Enter' || event.key === ' ') release()
      }}
      onBlur={release}
      onClick={() => {
        if (activationHandledRef.current) {
          activationHandledRef.current = false
          return
        }
        press()
        release()
      }}
    >
      <i />
      <span>{children ?? label}</span>
    </button>
  )
}

