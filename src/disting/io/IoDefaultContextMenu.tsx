import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { ControlIcon } from '../controls'

export interface ContextMenuPoint {
  x: number
  y: number
}

interface Props {
  label: string
  point: ContextMenuPoint | null
  entry: string | null
  anchorRef?: RefObject<HTMLElement | null>
  unavailableReason?: string
  onClose(): void
}

const VIEWPORT_MARGIN = 8

export function IoDefaultContextMenu({
  label,
  point,
  entry,
  anchorRef,
  unavailableReason,
  onClose,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<ContextMenuPoint | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const closeMenu = useEffectEvent(onClose)

  useLayoutEffect(() => {
    if (!point || typeof window === 'undefined') return
    const menu = menuRef.current
    if (!menu) return
    const anchor = anchorRef?.current
    if (anchor) {
      const anchorStyles = window.getComputedStyle(anchor)
      for (let index = 0; index < anchorStyles.length; index += 1) {
        const property = anchorStyles.item(index)
        if (property.startsWith('--')) {
          menu.style.setProperty(
            property,
            anchorStyles.getPropertyValue(property),
          )
        }
      }
      menu.style.colorScheme = anchorStyles.colorScheme
    }
    const rect = menu.getBoundingClientRect()
    setPosition({
      x: Math.max(
        VIEWPORT_MARGIN,
        Math.min(point.x, window.innerWidth - rect.width - VIEWPORT_MARGIN),
      ),
      y: Math.max(
        VIEWPORT_MARGIN,
        Math.min(point.y, window.innerHeight - rect.height - VIEWPORT_MARGIN),
      ),
    })
  }, [anchorRef, point])

  useEffect(() => {
    if (!point) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && menuRef.current?.contains(target)) return
      closeMenu()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeMenu()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    const focusFrame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    })
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [point])

  if (!point) return null

  const canPosition = typeof document !== 'undefined'
  const resolvedPosition = position ?? point
  const style: CSSProperties = {
    left: resolvedPosition.x,
    top: resolvedPosition.y,
    visibility: canPosition && !position ? 'hidden' : 'visible',
  }
  const copy = async () => {
    if (!entry) return
    try {
      await navigator.clipboard.writeText(entry)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }
  const menu = (
    <div
      ref={menuRef}
      className="io-default-context-menu"
      role="menu"
      aria-label={`${label} Lua default`}
      style={style}
    >
      {entry ? (
        <code>{entry}</code>
      ) : (
        <p>{unavailableReason ?? 'This route has no Lua default annotation.'}</p>
      )}
      <button
        type="button"
        role="menuitem"
        disabled={!entry || copyState === 'copied'}
        onClick={() => void copy()}
      >
        <ControlIcon name="code" size={14} />
        <span>{copyState === 'copied'
          ? 'Copied Lua entry'
          : copyState === 'failed'
            ? 'Copy failed · retry'
            : 'Copy Lua entry'}</span>
      </button>
    </div>
  )

  return canPosition ? createPortal(menu, document.body) : menu
}
