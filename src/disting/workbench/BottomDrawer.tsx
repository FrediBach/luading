import {
  memo,
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { shouldReuseDrawerPanel } from './drawer-panel'
import type { DrawerTabId } from './workbench-layout'
import { DRAWER_SHORTCUTS } from './workbench-shortcuts'

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
      aria-labelledby={`workbench-drawer-tab-${id}`}
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
  const drawerRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const wasOpenRef = useRef(open)

  useEffect(() => {
    if (
      wasOpenRef.current
      && !open
      && drawerRef.current?.contains(document.activeElement)
    ) {
      const activeIndex = tabs.findIndex((tab) => tab.id === activeTab)
      tabRefs.current[activeIndex]?.focus()
    }
    wasOpenRef.current = open
  }, [activeTab, open, tabs])

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + tabs.length) % tabs.length
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % tabs.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1
    }
    if (nextIndex === null) return
    event.preventDefault()
    const nextTab = tabs[nextIndex]
    if (!nextTab) return
    onToggleTab(nextTab.id)
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <section
      ref={drawerRef}
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
            } else if (event.key === 'Home') {
              event.preventDefault()
              onHeightChange(140)
            } else if (event.key === 'End') {
              event.preventDefault()
              onHeightChange(420)
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
        {tabs.map((tab, index) => (
          <button
            ref={(element) => {
              tabRefs.current[index] = element
            }}
            type="button"
            id={`workbench-drawer-tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-expanded={open && activeTab === tab.id}
            aria-controls={`workbench-drawer-panel-${tab.id}`}
            aria-keyshortcuts={DRAWER_SHORTCUTS[tab.id].aria}
            className={open && activeTab === tab.id ? 'is-active' : ''}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => onToggleTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            key={tab.id}
          >
            {tab.label}
            {tab.badge !== undefined && <span>{tab.badge}</span>}
            <kbd>{DRAWER_SHORTCUTS[tab.id].label}</kbd>
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
