import {
  memo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { shouldReuseDrawerPanel } from './drawer-panel'
import type { DrawerTabId } from './workbench-layout'

export interface DrawerTabDefinition {
  id: DrawerTabId
  label: string
  badge?: string | number
  content: ReactNode
}

interface Props {
  tabs: DrawerTabDefinition[]
  activeTab: DrawerTabId
  open: boolean
  height: number
  onToggleTab(tab: DrawerTabId): void
  onHeightChange(height: number): void
}

interface DrawerPanelProps {
  id: DrawerTabId
  active: boolean
  content: ReactNode
}

const DrawerPanel = memo(function DrawerPanel({
  id,
  active,
  content,
}: DrawerPanelProps) {
  return (
    <div
      id={`workbench-drawer-panel-${id}`}
      role="tabpanel"
      className="workbench-drawer-panel"
      hidden={!active}
    >
      {content}
    </div>
  )
}, shouldReuseDrawerPanel)

export function BottomDrawer({
  tabs,
  activeTab,
  open,
  height,
  onToggleTab,
  onHeightChange,
}: Props) {
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  return (
    <section
      className={`workbench-drawer${open ? ' is-open' : ''}`}
      style={{ '--workbench-drawer-height': `${height}px` } as CSSProperties}
      aria-label="Workbench tools"
    >
      {open && (
        <div
          className="workbench-drawer-resizer"
          role="separator"
          aria-label="Resize tool drawer"
          aria-orientation="horizontal"
          aria-valuemin={140}
          aria-valuemax={420}
          aria-valuenow={Math.round(height)}
          tabIndex={0}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 40 : 10
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              onHeightChange(height + step)
            } else if (event.key === 'ArrowDown') {
              event.preventDefault()
              onHeightChange(height - step)
            }
          }}
          onPointerDown={(event) => {
            dragRef.current = { startY: event.clientY, startHeight: height }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current
            if (!drag) return
            onHeightChange(drag.startHeight + drag.startY - event.clientY)
          }}
          onPointerUp={(event) => {
            dragRef.current = null
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
          }}
          onPointerCancel={() => {
            dragRef.current = null
          }}
          onLostPointerCapture={() => {
            dragRef.current = null
          }}
        />
      )}

      <div className="workbench-drawer-tabs" role="tablist" aria-label="Workbench tools">
        {tabs.map((tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={open && activeTab === tab.id}
            aria-controls={`workbench-drawer-panel-${tab.id}`}
            className={open && activeTab === tab.id ? 'is-active' : ''}
            onClick={() => onToggleTab(tab.id)}
            key={tab.id}
          >
            {tab.label}
            {tab.badge !== undefined && <span>{tab.badge}</span>}
          </button>
        ))}
        <span className="workbench-drawer-hint">
          {open ? 'select active tab to collapse' : 'tools collapsed'}
        </span>
      </div>

      <div className="workbench-drawer-panels">
        {tabs.map((tab) => (
          <DrawerPanel
            id={tab.id}
            active={open && activeTab === tab.id}
            content={tab.content}
            key={tab.id}
          />
        ))}
      </div>
    </section>
  )
}
